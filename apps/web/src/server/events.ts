// Creating and reading events: spec rules E1 to E7, E9, E10 and V1.
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { datedAvailability, events, participants, weekdayAvailability } from "@/db/schema";
import { characterCount } from "@/domain/display-name";
import { eventSegment } from "@/domain/event-address";
import { newEventId } from "@/domain/event-id";
import { deletionDate } from "@/domain/retention";
import {
	MAX_DATES,
	type Schedule,
	scheduleSlots,
	slotKey,
	SLOT_LENGTHS,
	validateSchedule,
	type Weekday,
} from "@/domain/schedule";
import { env } from "@/env";

import { datedSlotKey, firstDayOfWeekOf, isLive, scheduleOf, weekdaySlotKey } from "./event-rows";
import { hashSecret, newSecret } from "./secrets";
import { countCreated } from "./usage";

export const EVENT_NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;

const isoDate = z.iso.date().transform((text) => Temporal.PlainDate.from(text));
const weekday = z.literal([1, 2, 3, 4, 5, 6, 7]);

function isTimeZone(zone: string): boolean {
	try {
		Temporal.Now.zonedDateTimeISO(zone);

		return true;
	} catch {
		return false;
	}
}

export const newEventSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.refine((name) => characterCount(name) <= EVENT_NAME_MAX_LENGTH),
	description: z
		.string()
		.trim()
		.refine((text) => characterCount(text) <= DESCRIPTION_MAX_LENGTH),
	days: z.discriminatedUnion("mode", [
		z.object({ mode: z.literal("range"), first: isoDate, last: isoDate }),
		// The upper bounds only stop oversized input; validateSchedule applies rule E2.
		z.object({ mode: z.literal("dates"), dates: z.array(isoDate).max(MAX_DATES * 2) }),
		z.object({ mode: z.literal("weekdays"), weekdays: z.array(weekday).max(14) }),
	]),
	dailyStart: z.int(),
	dailyEnd: z.int(),
	slotLength: z.literal(SLOT_LENGTHS),
	referenceZone: z.string().refine(isTimeZone),
	firstDayOfWeek: weekday,
});

export type NewEvent = z.input<typeof newEventSchema>;

export type CreateEventResult =
	| {
			ok: true;
			id: string;
			/** `{slug}-{id}` or `{id}`, the path segment of the share link. */
			segment: string;
			/** Shown once in the admin link and never stored (E6). */
			adminSecret: string;
	  }
	/** Field paths that failed validation, and rule codes such as `E2.too-many-dates`. */
	| { ok: false; problems: string[] };

export function storedDays(days: Schedule["days"]) {
	const none = { rangeFirst: null, rangeLast: null, dates: null, weekdays: null };

	if (days.mode === "range") {
		return { ...none, rangeFirst: days.first.toString(), rangeLast: days.last.toString() };
	}

	if (days.mode === "dates") {
		return { ...none, dates: days.dates.map(String) };
	}

	return { ...none, weekdays: days.weekdays };
}

/** Creates an event by rules E1 to E7. */
export async function createEvent(
	input: NewEvent,
	now = Temporal.Now.instant(),
): Promise<CreateEventResult> {
	const parsed = newEventSchema.safeParse(input);

	if (!parsed.success) {
		return { ok: false, problems: parsed.error.issues.map((issue) => issue.path.join(".")) };
	}

	const { name, description, days, dailyStart, dailyEnd, slotLength, referenceZone } = parsed.data;
	const schedule: Schedule = { days, dailyStart, dailyEnd, slotLength, referenceZone };
	const problems = validateSchedule(schedule, now);

	if (problems.length > 0) {
		return { ok: false, problems };
	}

	const adminSecret = newSecret();

	// About 70 random bits make a collision negligible; the primary key would refuse one.
	const id = newEventId();

	await db().transaction(async (tx) => {
		await tx.insert(events).values({
			id,
			name,
			description,
			dayMode: days.mode,
			...storedDays(days),
			dailyStart,
			dailyEnd,
			slotLength,
			referenceZone,
			firstDayOfWeek: parsed.data.firstDayOfWeek,
			adminSecretHash: hashSecret(adminSecret),
			createdAt: now.toString(),
			changedAt: now.toString(),
		});
		await countCreated(tx, now);
	});

	return { ok: true, id, segment: eventSegment(id, name), adminSecret };
}

export type EventView = {
	id: string;
	name: string;
	description: string;
	segment: string;
	/** The instant of the last change, compared by the page's version check (Phase 2 rule F1). */
	version: string;
	schedule: Schedule;
	firstDayOfWeek: Weekday;
	/** `null` when the instance keeps events permanently (Phase 2 rule X2). */
	deletionDate: Temporal.PlainDate | null;
	/** Slot keys of the event, in time order. */
	slots: string[];
	/** In joining order, each with the keys of the slots they marked (V1). */
	participants: { name: string; available: string[] }[];
};

async function availableKeys(dayMode: string, participantIds: string[]) {
	const byParticipant = new Map<string, string[]>(participantIds.map((id) => [id, []]));

	if (participantIds.length === 0) {
		return byParticipant;
	}

	const rows =
		dayMode === "weekdays"
			? (
					await db()
						.select()
						.from(weekdayAvailability)
						.where(inArray(weekdayAvailability.participantId, participantIds))
				).map((row) => ({ participantId: row.participantId, key: weekdaySlotKey(row) }))
			: (
					await db()
						.select()
						.from(datedAvailability)
						.where(inArray(datedAvailability.participantId, participantIds))
				).map((row) => ({ participantId: row.participantId, key: datedSlotKey(row) }));

	for (const { participantId, key } of rows) {
		byParticipant.get(participantId)?.push(key);
	}

	return byParticipant;
}

/** The live event `id` (Phase 2 rule X3), or `undefined`. */
async function liveRow(id: string, now: Temporal.Instant) {
	const [row] = await db().select().from(events).where(eq(events.id, id));

	return row !== undefined && isLive(row, now) ? row : undefined;
}

/**
 * The version of event `id`, or `null` when the event no longer exists or has expired (Phase 2
 * rules F4 and X3).
 */
export async function eventVersion(
	id: string,
	now = Temporal.Now.instant(),
): Promise<string | null> {
	const row = await liveRow(id, now);

	return row === undefined ? null : Temporal.Instant.from(row.changedAt).toString();
}

/**
 * Everything anyone with the share link sees (V1), or `undefined` for an unknown (E9) or
 * expired (Phase 2 rule X3) event.
 */
export async function readEvent(
	id: string,
	now = Temporal.Now.instant(),
): Promise<EventView | undefined> {
	const row = await liveRow(id, now);

	if (row === undefined) {
		return undefined;
	}

	const people = await db()
		.select({ id: participants.id, name: participants.displayName })
		.from(participants)
		.where(eq(participants.eventId, id))
		.orderBy(asc(participants.createdAt), asc(participants.id));

	const keys = await availableKeys(
		row.dayMode,
		people.map((person) => person.id),
	);

	const schedule = scheduleOf(row);

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		segment: eventSegment(row.id, row.name),
		version: Temporal.Instant.from(row.changedAt).toString(),
		schedule,
		firstDayOfWeek: firstDayOfWeekOf(row),
		deletionDate: deletionDate(
			schedule,
			Temporal.Instant.from(row.changedAt),
			env().RETENTION_DAYS,
		),
		slots: scheduleSlots(schedule).map((slot) => slotKey(slot)),
		participants: people.map((person) => ({
			name: person.name,
			available: keys.get(person.id) ?? [],
		})),
	};
}
