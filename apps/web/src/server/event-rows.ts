// Conversions between stored event rows and domain values, shared by the data access layer.
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
	datedAvailability,
	events,
	participants,
	participantTokens,
	weekdayAvailability,
} from "@/db/schema";
import { expiresAt } from "@/domain/retention";
import {
	type EventDays,
	type Schedule,
	slotKey,
	type SlotLength,
	toSlotLength,
	toWeekday,
	type Weekday,
} from "@/domain/schedule";
import { env } from "@/env";

import { hashSecret } from "./secrets";

export type EventRow = typeof events.$inferSelect;

/** The database or an open transaction on it. */
export type Queries = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

function weekday(stored: number): Weekday {
	const found = toWeekday(stored);

	if (found === undefined) {
		throw new Error(`Stored weekday ${stored} is outside 1 to 7.`);
	}

	return found;
}

function slotLength(stored: number): SlotLength {
	const found = toSlotLength(stored);

	if (found === undefined) {
		throw new Error(`Stored slot length ${stored} is not allowed.`);
	}

	return found;
}

function daysOf(row: EventRow): EventDays {
	if (row.dayMode === "range" && row.rangeFirst !== null && row.rangeLast !== null) {
		return {
			mode: "range",
			first: Temporal.PlainDate.from(row.rangeFirst),
			last: Temporal.PlainDate.from(row.rangeLast),
		};
	}

	if (row.dayMode === "dates" && row.dates !== null) {
		return { mode: "dates", dates: row.dates.map((date) => Temporal.PlainDate.from(date)) };
	}

	if (row.dayMode === "weekdays" && row.weekdays !== null) {
		return { mode: "weekdays", weekdays: row.weekdays.map(weekday) };
	}

	// The check constraint events_days_match_mode makes this unreachable.
	throw new Error(`Event ${row.id} has no days for its day mode.`);
}

export function scheduleOf(row: EventRow): Schedule {
	return {
		days: daysOf(row),
		dailyStart: row.dailyStart,
		dailyEnd: row.dailyEnd,
		slotLength: slotLength(row.slotLength),
		referenceZone: row.referenceZone,
	};
}

export function firstDayOfWeekOf(row: EventRow): Weekday {
	return weekday(row.firstDayOfWeek);
}

export function weekdaySlotKey(row: { weekday: number; minute: number }): string {
	return slotKey({ kind: "weekday", weekday: weekday(row.weekday), minute: row.minute });
}

export function datedSlotKey(row: { slotStart: string }): string {
	return slotKey({ kind: "dated", start: Temporal.Instant.from(row.slotStart) });
}

/** A participant as anyone with the share link sees them. */
export type ParticipantView = {
	/** The public id; the database key stays inside the server. */
	id: string;
	name: string;
	/** Keys of the slots they marked. */
	available: string[];
};

/** A participant as the event shows them, with the schedule their slot keys belong to. */
export type ParticipantRead = { participant: ParticipantView; schedule: Schedule };

/** The participant `row` as the event shows them, with the slot keys they marked. */
export async function participantRead(
	queries: Queries,
	event: EventRow,
	row: { id: string; publicId: string; displayName: string },
): Promise<ParticipantRead> {
	const keys = await availableKeys(queries, event, [row.id]);

	return {
		participant: { id: row.publicId, name: row.displayName, available: keys.get(row.id) ?? [] },
		schedule: scheduleOf(event),
	};
}

/** The slot keys each of `participantIds` marked, by participant, from the table of the event's day mode. */
export async function availableKeys(
	queries: Queries,
	event: EventRow,
	participantIds: string[],
): Promise<Map<string, string[]>> {
	const byParticipant = new Map<string, string[]>(participantIds.map((id) => [id, []]));

	if (participantIds.length === 0) {
		return byParticipant;
	}

	const rows =
		event.dayMode === "weekdays"
			? (
					await queries
						.select()
						.from(weekdayAvailability)
						.where(inArray(weekdayAvailability.participantId, participantIds))
				).map((row) => ({ participantId: row.participantId, key: weekdaySlotKey(row) }))
			: (
					await queries
						.select()
						.from(datedAvailability)
						.where(inArray(datedAvailability.participantId, participantIds))
				).map((row) => ({ participantId: row.participantId, key: datedSlotKey(row) }));

	for (const { participantId, key } of rows) {
		byParticipant.get(participantId)?.push(key);
	}

	return byParticipant;
}

/**
 * The version a change gives the event: `now`, or one microsecond after the stored version when
 * that is not earlier. Two changes in the same microsecond, or a change whose `now` was taken
 * before it waited for the lock, still move the version strictly forward. Computed in the
 * UPDATE, so it reads the version the previous change committed.
 */
export function nextVersion(now: Temporal.Instant) {
	return sql<string>`greatest(${now.toString()}::timestamptz, ${events.changedAt} + interval '1 microsecond')`;
}

/**
 * Records a change to the event or a response. It moves the version and with
 * it a weekday event's deletion date.
 */
export async function touchEvent(queries: Queries, row: EventRow, now: Temporal.Instant) {
	await queries
		.update(events)
		.set({ changedAt: nextVersion(now) })
		.where(eq(events.id, row.id));
}

/**
 * Whether the event has not expired yet. From the end of its deletion date an event is unknown
 * to every page, action and version check, even before the purge deletes it.
 */
export function isLive(row: EventRow, now: Temporal.Instant): boolean {
	const end = expiresAt(
		scheduleOf(row),
		Temporal.Instant.from(row.changedAt),
		env().RETENTION_DAYS,
	);

	return end === null || Temporal.Instant.compare(now, end) < 0;
}

/**
 * The live event `id`, or `undefined` once it has expired or never existed. With `lock`, the
 * row stays locked until the transaction ends, so changes of one event happen one after another.
 */
export async function liveEvent(
	queries: Queries,
	id: string,
	now: Temporal.Instant,
	lock: "lock" | "read",
): Promise<EventRow | undefined> {
	const query = queries.select().from(events).where(eq(events.id, id));
	const [row] = lock === "lock" ? await query.for("update") : await query;

	return row !== undefined && isLive(row, now) ? row : undefined;
}

/** The participant of a live event `eventId` that holds `token`, with its event, or `undefined`. */
export async function participantByToken(
	queries: Queries,
	eventId: string,
	token: string,
	now: Temporal.Instant,
) {
	const [found] = await queries
		.select({ participant: participants, event: events })
		.from(participantTokens)
		.innerJoin(participants, eq(participants.id, participantTokens.participantId))
		.innerJoin(events, eq(events.id, participants.eventId))
		.where(and(eq(participantTokens.tokenHash, hashSecret(token)), eq(events.id, eventId)));

	return found !== undefined && isLive(found.event, now) ? found : undefined;
}

/**
 * The participant that holds `token`, as `participantByToken` finds them, with the event row
 * locked for a change. The token is checked before the lock, so a wrong token never waits for
 * or holds it, and again under the lock, since the participant may have left in between.
 */
export async function participantForChange(
	queries: Queries,
	eventId: string,
	token: string,
	now: Temporal.Instant,
) {
	if ((await participantByToken(queries, eventId, token, now)) === undefined) {
		return;
	}

	await queries.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");

	return participantByToken(queries, eventId, token, now);
}
