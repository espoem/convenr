// Managing an event behind the admin link. Every change locks the event
// row first, so it and a participant's save happen one after the other.
import { and, asc, count, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { datedAvailability, events, participants, weekdayAvailability } from "@/db/schema";
import { eventSegment } from "@/domain/event-address";
import { editProblems, removedSlots } from "@/domain/event-edit";
import type { Schedule, Slot } from "@/domain/schedule";
import type { EventVersion } from "@/lib/event-version";

import {
	changeStamp,
	type EventRow,
	firstDayOfWeekOf,
	liveEvent,
	type Queries,
	scheduleOf,
	touchEvent,
} from "./event-rows";
import {
	type EventProblem,
	type EventView,
	eventViewOf,
	inputProblems,
	type NewEvent,
	newEventSchema,
	ruleProblems,
	storedDays,
} from "./events";
import { matchesSecret } from "./secrets";
import { countDeleted } from "./usage";

export type ManagedEvent = NewEvent & {
	id: string;
	segment: string;
	/** Slot length, day mode and reference zone are locked because people joined. */
	locked: boolean;
	/** Each with their public id. */
	participants: { id: string; name: string }[];
};

/**
 * Which versions of the event a change was made for. `match` says the caller saw the event at
 * one of these versions: a change is refused when none is the current one. It guards against
 * overwriting a change the caller has not seen; it never accepts a loss of availability.
 */
export type Precondition = { kind: "any" } | { kind: "match"; versions: EventVersion[] };

/**
 * Whether the caller accepts that participants lose availability. `version` is the version a
 * refusal named when it counted the loss: the acceptance holds only while the event has it.
 */
export type Confirmation = { kind: "none" } | { kind: "version"; version: EventVersion };

const NO_CONFIRMATION: Confirmation = { kind: "none" };

export type UpdateEventResult =
	/** The event as the change wrote it. */
	| { status: "saved"; event: EventView }
	| { status: "denied" }
	| { status: "invalid"; problems: EventProblem[] }
	/** The current version differs from every version the precondition names. */
	| { status: "changed"; version: EventVersion }
	/** How many participants would lose part of their availability, at the current version. */
	| { status: "confirm"; losing: number; version: EventVersion };

/** `not_found` when the secret fits but the event has no such participant. */
export type RemoveParticipantResult =
	| { status: "removed" }
	| { status: "denied" }
	| { status: "not_found" };

/**
 * The live event `id` when `secret` is its admin secret. With `lock`, the row is locked for a
 * change, and only after the secret fits: a wrong secret never waits for or holds the lock. The
 * row is read again under the lock, since it may have changed or expired in between.
 */
async function adminRow(
	queries: Queries,
	id: string,
	secret: string,
	lock: "lock" | "read",
	now: Temporal.Instant,
): Promise<EventRow | undefined> {
	const fits = (row: EventRow | undefined) =>
		row !== undefined && matchesSecret(row.adminSecretHash, secret) ? row : undefined;

	const read = fits(await liveEvent(queries, id, now, "read"));

	return read === undefined || lock === "read"
		? read
		: fits(await liveEvent(queries, id, now, "lock"));
}

/** Whether `row` already holds every column of `values`; lists are compared element by element. */
function keepsEveryValue(row: EventRow, values: Partial<EventRow>): boolean {
	const stored = new Map(Object.entries(row));

	return Object.entries(values).every(
		([column, value]) => JSON.stringify(stored.get(column)) === JSON.stringify(value),
	);
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

/** The event as the manage page edits it, or `undefined` without a valid secret. */
export async function readManagedEvent(
	id: string,
	secret: string,
	now = Temporal.Now.instant(),
): Promise<ManagedEvent | undefined> {
	const row = await adminRow(db(), id, secret, "read", now);

	if (row === undefined) {
		return undefined;
	}

	const people = await db()
		.select({ id: participants.publicId, name: participants.displayName })
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
 * Changes the fields in `change`; the others keep their stored values, read under the lock
 * so that two changes of different fields do not undo each other. A change that takes
 * availability away from participants is accepted only when the confirmation names the current
 * version, so the caller confirms what it was shown and not a count that other people's changes
 * can make true of someone else. A matching precondition alone confirms nothing. The answer is
 * the event as the change wrote it.
 */
export async function updateEvent(
	id: string,
	secret: string,
	change: Partial<NewEvent>,
	precondition: Precondition,
	now = Temporal.Now.instant(),
	confirmation: Confirmation = NO_CONFIRMATION,
): Promise<UpdateEventResult> {
	return db().transaction(async (tx): Promise<UpdateEventResult> => {
		const row = await adminRow(tx, id, secret, "lock", now);

		if (row === undefined) {
			return { status: "denied" };
		}

		const { version } = row;

		if (precondition.kind === "match" && !precondition.versions.includes(version)) {
			return { status: "changed", version };
		}

		const parsed = newEventSchema.safeParse({ ...inputOf(row), ...change }, { reportInput: true });

		if (!parsed.success) {
			return { status: "invalid", problems: inputProblems(parsed.error) };
		}

		const { name, description, days, dailyStart, dailyEnd, slotLength, referenceZone } =
			parsed.data;

		const stored = {
			name,
			description,
			dayMode: days.mode,
			...storedDays(days),
			dailyStart,
			dailyEnd,
			slotLength,
			referenceZone,
			firstDayOfWeek: parsed.data.firstDayOfWeek,
		};

		// A change that keeps every value writes nothing, so the version and a weekday event's
		// deletion date stay where they are.
		if (keepsEveryValue(row, stored)) {
			return { status: "saved", event: await eventViewOf(tx, row) };
		}

		const after: Schedule = { days, dailyStart, dailyEnd, slotLength, referenceZone };

		const [people] = await tx
			.select({ total: count() })
			.from(participants)
			.where(eq(participants.eventId, id));

		const before = scheduleOf(row);
		const issues = editProblems(before, after, (people?.total ?? 0) > 0, now);

		if (issues.length > 0) {
			return { status: "invalid", problems: ruleProblems(issues) };
		}

		const removed = removedSlots(before, after);
		const losing = await losingParticipants(tx, id, removed);

		const confirmed = confirmation.kind === "version" && confirmation.version === version;

		if (losing > 0 && !confirmed) {
			return { status: "confirm", losing, version };
		}

		await deleteAvailability(tx, id, removed);

		const [written] = await tx
			.update(events)
			.set({ ...stored, ...changeStamp(now) })
			.where(eq(events.id, id))
			.returning();

		if (written === undefined) {
			throw new Error("The event update returned no row.");
		}

		return { status: "saved", event: await eventViewOf(tx, written) };
	});
}

/**
 * Deletes the participant with public id `participantId` on the organizer's request, like a
 * participant leaving does.
 */
export async function removeParticipant(
	id: string,
	secret: string,
	participantId: string,
	now = Temporal.Now.instant(),
): Promise<RemoveParticipantResult> {
	return db().transaction(async (tx): Promise<RemoveParticipantResult> => {
		const row = await adminRow(tx, id, secret, "lock", now);

		if (row === undefined) {
			return { status: "denied" };
		}

		const deleted = await tx
			.delete(participants)
			.where(and(eq(participants.publicId, participantId), eq(participants.eventId, id)))
			.returning({ id: participants.id });

		if (deleted.length === 0) {
			return { status: "not_found" };
		}

		await touchEvent(tx, row, now);

		return { status: "removed" };
	});
}

/** Deletes the event with its participants and responses at once and for good. */
export async function removeEvent(
	id: string,
	secret: string,
	now = Temporal.Now.instant(),
): Promise<boolean> {
	return db().transaction(async (tx) => {
		const row = await adminRow(tx, id, secret, "lock", now);

		if (row === undefined) {
			return false;
		}

		await countDeleted(tx, row, now);
		await tx.delete(events).where(eq(events.id, id));

		return true;
	});
}
