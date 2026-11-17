// Managing an event behind the admin link: Phase 2 rules M1 to M8. Every change locks the event
// row first, so it and a participant's save (M9) happen one after the other.
import { and, asc, count, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { datedAvailability, events, participants, weekdayAvailability } from "@/db/schema";
import { eventSegment } from "@/domain/event-address";
import { editProblems, removedSlots } from "@/domain/event-edit";
import type { Schedule, Slot } from "@/domain/schedule";

import {
	type EventRow,
	firstDayOfWeekOf,
	type Queries,
	scheduleOf,
	touchEvent,
} from "./event-rows";
import { type NewEvent, newEventSchema, storedDays } from "./events";
import { matchesSecret } from "./secrets";

export type ManagedEvent = NewEvent & {
	id: string;
	segment: string;
	/** Slot length, day mode and reference zone are locked (M3). */
	locked: boolean;
	participants: { id: string; name: string }[];
};

export type UpdateEventResult =
	| { status: "saved"; segment: string }
	| { status: "denied" }
	/** Field paths and rule codes such as `E2.date-in-past` or `M3.locked`. */
	| { status: "invalid"; problems: string[] }
	/** How many participants would lose part of their availability (M5). */
	| { status: "confirm"; losing: number };

async function adminRow(queries: Queries, id: string, secret: string, lock: boolean) {
	const query = queries.select().from(events).where(eq(events.id, id));
	const [row] = lock ? await query.for("update") : await query;

	return row !== undefined && matchesSecret(row.adminSecretHash, secret) ? row : undefined;
}

function inputOf(row: EventRow): NewEvent {
	const { days, dailyStart, dailyEnd, slotLength, referenceZone } = scheduleOf(row);

	const shown = (): NewEvent["days"] => {
		switch (days.mode) {
			case "range":
				return { mode: "range", first: days.first.toString(), last: days.last.toString() };
			case "dates":
				return { mode: "dates", dates: days.dates.map(String) };
			case "weekdays":
				return days;
		}
	};

	return {
		name: row.name,
		description: row.description,
		days: shown(),
		dailyStart,
		dailyEnd,
		slotLength,
		referenceZone,
		firstDayOfWeek: firstDayOfWeekOf(row),
	};
}

/** The event as the manage page edits it, or `undefined` without a valid secret (M1). */
export async function readManagedEvent(
	id: string,
	secret: string,
): Promise<ManagedEvent | undefined> {
	const row = await adminRow(db(), id, secret, false);

	if (row === undefined) {
		return undefined;
	}

	const people = await db()
		.select({ id: participants.id, name: participants.displayName })
		.from(participants)
		.where(eq(participants.eventId, id))
		.orderBy(asc(participants.createdAt), asc(participants.id));

	return {
		...inputOf(row),
		id,
		segment: eventSegment(id, row.name),
		locked: people.length > 0,
		participants: people,
	};
}

/** Availability rows of event `eventId` in the `removed` slots, per table. */
function removedAvailability(queries: Queries, eventId: string, removed: Slot[]) {
	const people = queries
		.select({ id: participants.id })
		.from(participants)
		.where(eq(participants.eventId, eventId));

	const starts = removed.flatMap((slot) => (slot.kind === "dated" ? [slot.start.toString()] : []));

	const weekly = removed.flatMap((slot) =>
		slot.kind === "weekday"
			? [
					and(
						eq(weekdayAvailability.weekday, slot.weekday),
						eq(weekdayAvailability.minute, slot.minute),
					),
				]
			: [],
	);

	return {
		dated:
			starts.length === 0
				? undefined
				: and(
						inArray(datedAvailability.participantId, people),
						inArray(datedAvailability.slotStart, starts),
					),
		weekly:
			weekly.length === 0
				? undefined
				: and(inArray(weekdayAvailability.participantId, people), or(...weekly)),
	};
}

async function losingParticipants(queries: Queries, eventId: string, removed: Slot[]) {
	const { dated, weekly } = removedAvailability(queries, eventId, removed);
	const losing = new Set<string>();

	if (dated !== undefined) {
		const rows = await queries
			.selectDistinct({ id: datedAvailability.participantId })
			.from(datedAvailability)
			.where(dated);

		for (const row of rows) {
			losing.add(row.id);
		}
	}

	if (weekly !== undefined) {
		const rows = await queries
			.selectDistinct({ id: weekdayAvailability.participantId })
			.from(weekdayAvailability)
			.where(weekly);

		for (const row of rows) {
			losing.add(row.id);
		}
	}

	return losing.size;
}

async function deleteAvailability(queries: Queries, eventId: string, removed: Slot[]) {
	const { dated, weekly } = removedAvailability(queries, eventId, removed);

	if (dated !== undefined) {
		await queries.delete(datedAvailability).where(dated);
	}

	if (weekly !== undefined) {
		await queries.delete(weekdayAvailability).where(weekly);
	}
}

/**
 * Changes the event's fields by rules M2 to M6. A change that takes availability away from
 * participants needs `confirmedLosing` to match how many lose it (M5); the count is asked for
 * again when it changed in the meantime.
 */
export async function updateEvent(
	id: string,
	secret: string,
	input: NewEvent,
	confirmedLosing: number | null,
	now = Temporal.Now.instant(),
): Promise<UpdateEventResult> {
	const parsed = newEventSchema.safeParse(input);

	if (!parsed.success) {
		return {
			status: "invalid",
			problems: parsed.error.issues.map((issue) => issue.path.join(".")),
		};
	}

	const { name, description, days, dailyStart, dailyEnd, slotLength, referenceZone } = parsed.data;
	const after: Schedule = { days, dailyStart, dailyEnd, slotLength, referenceZone };

	return db().transaction(async (tx): Promise<UpdateEventResult> => {
		const row = await adminRow(tx, id, secret, true);

		if (row === undefined) {
			return { status: "denied" };
		}

		const [people] = await tx
			.select({ total: count() })
			.from(participants)
			.where(eq(participants.eventId, id));

		const before = scheduleOf(row);
		const problems = editProblems(before, after, (people?.total ?? 0) > 0, now);

		if (problems.length > 0) {
			return { status: "invalid", problems };
		}

		const removed = removedSlots(before, after);
		const losing = await losingParticipants(tx, id, removed);

		if (losing > 0 && confirmedLosing !== losing) {
			return { status: "confirm", losing };
		}

		await deleteAvailability(tx, id, removed);
		await tx
			.update(events)
			.set({
				name,
				description,
				dayMode: days.mode,
				...storedDays(days),
				dailyStart,
				dailyEnd,
				slotLength,
				referenceZone,
				firstDayOfWeek: parsed.data.firstDayOfWeek,
				changedAt: now.toString(),
			})
			.where(eq(events.id, id));

		return { status: "saved", segment: eventSegment(id, name) };
	});
}

/** Deletes a participant like rule P9 does, on the organizer's request (M7). */
export async function removeParticipant(
	id: string,
	secret: string,
	participantId: string,
	now = Temporal.Now.instant(),
): Promise<boolean> {
	return db().transaction(async (tx) => {
		const row = await adminRow(tx, id, secret, true);

		if (row === undefined) {
			return false;
		}

		const deleted = await tx
			.delete(participants)
			.where(and(eq(participants.id, participantId), eq(participants.eventId, id)))
			.returning({ id: participants.id });

		if (deleted.length === 0) {
			return false;
		}

		await touchEvent(tx, row, now);

		return true;
	});
}

/** Deletes the event with its participants and responses at once and for good (M8). */
export async function removeEvent(id: string, secret: string): Promise<boolean> {
	return db().transaction(async (tx) => {
		const row = await adminRow(tx, id, secret, true);

		if (row === undefined) {
			return false;
		}

		await tx.delete(events).where(eq(events.id, id));

		return true;
	});
}
