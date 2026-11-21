// Conversions between stored event rows and domain values, shared by the data access layer.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "@/db/client";
import {
	datedAvailability,
	events,
	participants,
	participantTokens,
	pollAvailability,
	pollOptions,
	weekdayAvailability,
} from "@/db/schema";
import type { FinalTime } from "@/domain/final-time";
import type { Level, Levels } from "@/domain/levels";
import { inTimeOrder, optionKey } from "@/domain/poll";
import { type Deletion, deletionOf, expiresAt, type Keeping } from "@/domain/retention";
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
import type { EventVersion } from "@/lib/event-version";

import { hashSecret } from "./secrets";

type OptionRow = typeof pollOptions.$inferSelect;

/** An event's columns with its poll options; a grid has none. */
export type EventRow = typeof events.$inferSelect & { options: OptionRow[] };

/** The database or an open transaction on it. */
export type Queries = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** The event `columns` with the options stored for it. */
export async function withOptions(
	queries: Queries,
	columns: typeof events.$inferSelect,
): Promise<EventRow> {
	const options =
		columns.kind === "poll"
			? await queries.select().from(pollOptions).where(eq(pollOptions.eventId, columns.id))
			: [];

	return { ...columns, options };
}

/** A stored column of a grid, which the check constraint events_schedule_matches_kind fills. */
function gridColumn<Value>(row: EventRow, value: Value | null): Value {
	if (value === null) {
		throw new Error(`Grid event ${row.id} lacks a column of its grid.`);
	}

	return value;
}

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

	// The check constraint events_schedule_matches_kind makes this unreachable.
	throw new Error(`Event ${row.id} has no days for its day mode.`);
}

export function scheduleOf(row: EventRow): Schedule {
	if (row.kind === "poll") {
		const options = row.options.map((option) => ({
			id: option.id,
			start: Temporal.Instant.from(option.start),
			end: Temporal.Instant.from(option.end),
		}));

		return { kind: "poll", options: inTimeOrder(options), referenceZone: row.referenceZone };
	}

	return {
		kind: "grid",
		days: daysOf(row),
		dailyStart: gridColumn(row, row.dailyStart),
		dailyEnd: gridColumn(row, row.dailyEnd),
		slotLength: slotLength(gridColumn(row, row.slotLength)),
		referenceZone: row.referenceZone,
		firstDayOfWeek: weekday(gridColumn(row, row.firstDayOfWeek)),
	};
}

/** The columns that clear a final time; its sequence stays, so a later pick counts on. */
export const OPEN_FINAL = { finalState: "open", finalStart: null, finalEnd: null } as const;

export function finalOf(row: EventRow): FinalTime {
	const sequence = row.finalSequence;

	if (row.finalState === "open") {
		return { kind: "open", sequence };
	}

	// The check constraint events_final makes a chosen final time without both ends unreachable.
	if (row.finalStart === null || row.finalEnd === null) {
		throw new Error(`Event ${row.id} has a chosen final time without its ends.`);
	}

	return {
		kind: "chosen",
		start: Temporal.Instant.from(row.finalStart),
		end: Temporal.Instant.from(row.finalEnd),
		sequence,
	};
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
	/** The level of each slot they marked, by slot key. */
	levels: Levels;
};

/** A participant as the event shows them, with the schedule their slot keys belong to. */
export type ParticipantRead = { participant: ParticipantView; schedule: Schedule };

/** The participant `row` as the event shows them, with the levels they marked. */
export async function participantRead(
	queries: Queries,
	event: EventRow,
	row: { id: string; publicId: string; displayName: string },
): Promise<ParticipantRead> {
	const levels = await responseLevels(queries, event, [row.id]);

	return {
		participant: { id: row.publicId, name: row.displayName, levels: levels.get(row.id) ?? {} },
		schedule: scheduleOf(event),
	};
}

type AnswerRow = { participantId: string; key: string; level: Level };

/** The stored answers of `participantIds`, from the table of the event's kind and day mode. */
async function answerRows(
	queries: Queries,
	event: EventRow,
	participantIds: string[],
): Promise<AnswerRow[]> {
	if (event.kind === "poll") {
		const rows = await queries
			.select()
			.from(pollAvailability)
			.where(inArray(pollAvailability.participantId, participantIds));

		return rows.map((row) => ({
			participantId: row.participantId,
			key: optionKey({ id: row.optionId }),
			level: row.level,
		}));
	}

	if (event.dayMode === "weekdays") {
		const rows = await queries
			.select()
			.from(weekdayAvailability)
			.where(inArray(weekdayAvailability.participantId, participantIds));

		return rows.map((row) => ({
			participantId: row.participantId,
			key: weekdaySlotKey(row),
			level: row.level,
		}));
	}

	const rows = await queries
		.select()
		.from(datedAvailability)
		.where(inArray(datedAvailability.participantId, participantIds));

	return rows.map((row) => ({
		participantId: row.participantId,
		key: datedSlotKey(row),
		level: row.level,
	}));
}

/** The response of each of `participantIds`, by participant, from the table of the event's kind. */
export async function responseLevels(
	queries: Queries,
	event: EventRow,
	participantIds: string[],
): Promise<Map<string, Record<string, Level>>> {
	const byParticipant = new Map<string, Record<string, Level>>(
		participantIds.map((id) => [id, {}]),
	);

	if (participantIds.length === 0) {
		return byParticipant;
	}

	for (const { participantId, key, level } of await answerRows(queries, event, participantIds)) {
		const levels = byParticipant.get(participantId);

		if (levels !== undefined) {
			levels[key] = level;
		}
	}

	return byParticipant;
}

/**
 * What every change sets on the event: the next version and the time of the change. The version
 * is counted in the UPDATE, so it reads the one the previous change committed, and the caller
 * holds the event lock. The time is the writer's clock, which is how all times are taken (ADR 0002).
 */
export function changeStamp(now: Temporal.Instant) {
	return { version: sql<EventVersion>`${events.version} + 1`, changedAt: now.toString() };
}

/**
 * Records a change to the event or a response. It moves the version and with
 * it a weekday event's deletion date.
 */
export async function touchEvent(queries: Queries, row: EventRow, now: Temporal.Instant) {
	await queries.update(events).set(changeStamp(now)).where(eq(events.id, row.id));
}

/**
 * Whether the event has not expired yet. From the end of its deletion date an event is unknown
 * to every page, action and version check, even before the purge deletes it.
 */
export function isLive(row: EventRow, now: Temporal.Instant): boolean {
	const end = expiresAt(deletionOfRow(row), row.referenceZone);

	return end === null || Temporal.Instant.compare(now, end) < 0;
}

// The keeping is stored in `events.kept_until`: null when never kept, `infinity` while kept, and
// the end instant otherwise. Outside these two functions only SQL knows the form: the check
// events_kept_by_owner, the trigger events_keeping_ends_with_owner and the purge.
const KEPT = "infinity";

/** The keeping as stored. */
export function keepingOf(row: { keptUntil: string | null }): Keeping {
	if (row.keptUntil === null) {
		return { kind: "not_kept" };
	}

	return row.keptUntil === KEPT
		? { kind: "kept" }
		: { kind: "ended", at: Temporal.Instant.from(row.keptUntil) };
}

/** The keeping in the form `keepingOf` reads. */
export function storedKeeping(keeping: Keeping): string | null {
	if (keeping.kind === "ended") {
		return keeping.at.toString();
	}

	return keeping.kind === "kept" ? KEPT : null;
}

/** When the event is deleted under the current retention setting, or who keeps it. */
export function deletionOfRow(row: EventRow): Deletion {
	return deletionOf(
		scheduleOf(row),
		Temporal.Instant.from(row.changedAt),
		env().RETENTION_DAYS,
		finalOf(row),
		keepingOf(row),
	);
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
	const [columns] = lock === "lock" ? await query.for("update") : await query;

	if (columns === undefined) {
		return undefined;
	}

	const row = await withOptions(queries, columns);

	return isLive(row, now) ? row : undefined;
}

/**
 * Whom a request speaks for in an event: the holder of a participant token, or a signed-in
 * account, which stands for the participant linked to it.
 */
export type Holder = { kind: "token"; token: string } | { kind: "account"; accountId: string };

export function byToken(token: string): Holder {
	return { kind: "token", token };
}

async function heldRow(queries: Queries, eventId: string, holder: Holder) {
	const columns = { participant: participants, event: events };

	if (holder.kind === "account") {
		const [linked] = await queries
			.select(columns)
			.from(participants)
			.innerJoin(events, eq(events.id, participants.eventId))
			.where(and(eq(participants.eventId, eventId), eq(participants.accountId, holder.accountId)));

		return linked;
	}

	const [found] = await queries
		.select(columns)
		.from(participantTokens)
		.innerJoin(participants, eq(participants.id, participantTokens.participantId))
		.innerJoin(events, eq(events.id, participants.eventId))
		.where(
			and(
				eq(participantTokens.tokenHash, hashSecret(holder.token)),
				eq(events.id, eventId),
				// Linking retires a participant's tokens; this keeps a stray one from reaching it.
				isNull(participants.accountId),
			),
		);

	return found;
}

/** The participant of a live event `eventId` that `holder` stands for, with its event, or `undefined`. */
export async function participantOf(
	queries: Queries,
	eventId: string,
	holder: Holder,
	now: Temporal.Instant,
) {
	const found = await heldRow(queries, eventId, holder);

	if (found === undefined) {
		return;
	}

	const event = await withOptions(queries, found.event);

	return isLive(event, now) ? { participant: found.participant, event } : undefined;
}

/**
 * The participant of `holder`, as `participantOf` finds them, with the event row locked for a
 * change. The holder is checked before the lock, so a wrong token never waits for or holds it,
 * and again under the lock, since the participant may have left in between.
 */
export async function participantForChange(
	queries: Queries,
	eventId: string,
	holder: Holder,
	now: Temporal.Instant,
) {
	if ((await participantOf(queries, eventId, holder, now)) === undefined) {
		return;
	}

	await queries.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");

	return participantOf(queries, eventId, holder, now);
}
