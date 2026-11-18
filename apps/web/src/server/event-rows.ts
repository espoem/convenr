// Conversions between stored event rows and domain values, shared by the data access layer.
import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { events, participants, participantTokens } from "@/db/schema";
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

/**
 * Records a change to the event or a response. It moves the version and with
 * it a weekday event's deletion date.
 */
export async function touchEvent(queries: Queries, row: EventRow, now: Temporal.Instant) {
	await queries.update(events).set({ changedAt: now.toString() }).where(eq(events.id, row.id));
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
