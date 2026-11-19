// Creating and reading events.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { events, participants } from "@/db/schema";
import { characterCount } from "@/domain/display-name";
import { eventSegment } from "@/domain/event-address";
import type { EditProblem } from "@/domain/event-edit";
import { newPublicId } from "@/domain/public-id";
import { deletionDate } from "@/domain/retention";
import {
	MAX_DATES,
	type Schedule,
	type ScheduleIssue,
	scheduleSlots,
	slotKey,
	SLOT_LENGTHS,
	validateSchedule,
	type Weekday,
} from "@/domain/schedule";
import { env } from "@/env";

import { FIELD_CODES, fieldErrors } from "./api/field-codes";
import {
	availableKeys,
	type EventRow,
	firstDayOfWeekOf,
	liveEvent,
	type ParticipantView,
	type Queries,
	scheduleOf,
} from "./event-rows";
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

/**
 * The codes of a value of the wrong form: the API's field codes, and `unknown_time_zone`, the
 * server's own check of the reference zone.
 */
export const INPUT_CODES = [...FIELD_CODES, "unknown_time_zone"] as const;

export type InputCode = (typeof INPUT_CODES)[number];

const inputCodes: ReadonlySet<unknown> = new Set(INPUT_CODES);

function isInputCode(code: unknown): code is InputCode {
	return inputCodes.has(code);
}

/** The options of a custom check, whose `params.code` names it in a problem as zod names its own. */
function failsAs(code: InputCode) {
	return { params: { code } };
}

const tooLong = failsAs("too_long");

export const newEventSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.refine((name) => characterCount(name) <= EVENT_NAME_MAX_LENGTH, tooLong),
	description: z
		.string()
		.trim()
		.refine((text) => characterCount(text) <= DESCRIPTION_MAX_LENGTH, tooLong),
	days: z.discriminatedUnion("mode", [
		z.object({ mode: z.literal("range"), first: isoDate, last: isoDate }),
		// The upper bounds only stop oversized input; validateSchedule applies the real limits.
		z.object({ mode: z.literal("dates"), dates: z.array(isoDate).max(MAX_DATES * 2) }),
		z.object({ mode: z.literal("weekdays"), weekdays: z.array(weekday).max(14) }),
	]),
	dailyStart: z.int(),
	dailyEnd: z.int(),
	slotLength: z.literal(SLOT_LENGTHS),
	referenceZone: z.string().refine(isTimeZone, failsAs("unknown_time_zone")),
	firstDayOfWeek: weekday,
});

export type NewEvent = z.input<typeof newEventSchema>;

/**
 * Why a new or edited event was refused, at a path into `NewEvent` such as
 * `["days", "dates", 2]`. An `input` problem is a value of the wrong form, named by the API's
 * field code or by the custom check it failed; a `rule` problem is a valid value that breaks a
 * rule of the event.
 */
export type EventProblem =
	| { kind: "input"; code: InputCode; path: PropertyKey[] }
	| { kind: "rule"; code: EditProblem; path: PropertyKey[] };

export function inputProblems(error: z.ZodError): EventProblem[] {
	return error.issues.flatMap((issue): EventProblem[] => {
		if (issue.code !== "custom") {
			return fieldErrors([issue]).map(({ code, path }) => ({ kind: "input", code, path }));
		}

		const code: unknown = issue.params?.["code"];

		return [{ kind: "input", code: isInputCode(code) ? code : "invalid_value", path: issue.path }];
	});
}

export function ruleProblems(issues: ScheduleIssue<EditProblem>[]): EventProblem[] {
	return issues.map((issue) => ({ kind: "rule", ...issue }));
}

export type CreateEventResult =
	| {
			ok: true;
			/** Shown once in the admin link and never stored. */
			adminSecret: string;
			event: EventView;
	  }
	| { ok: false; problems: EventProblem[] };

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

/** Creates an event. */
export async function createEvent(
	input: NewEvent,
	now = Temporal.Now.instant(),
): Promise<CreateEventResult> {
	const parsed = newEventSchema.safeParse(input, { reportInput: true });

	if (!parsed.success) {
		return { ok: false, problems: inputProblems(parsed.error) };
	}

	const { name, description, days, dailyStart, dailyEnd, slotLength, referenceZone } = parsed.data;
	const schedule: Schedule = { days, dailyStart, dailyEnd, slotLength, referenceZone };
	const issues = validateSchedule(schedule, now);

	if (issues.length > 0) {
		return { ok: false, problems: ruleProblems(issues) };
	}

	const adminSecret = newSecret("admin");

	// About 70 random bits make a collision negligible; the primary key would refuse one.
	const id = newPublicId();

	const row = await db().transaction(async (tx) => {
		const [inserted] = await tx
			.insert(events)
			.values({
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
			})
			.returning();

		if (inserted === undefined) {
			throw new Error("The event insert returned no row.");
		}

		await countCreated(tx, now);

		return inserted;
	});

	// Built from the inserted row, so the answer does not depend on a later read finding the event.
	return { ok: true, adminSecret, event: viewOf(row, []) };
}

export type EventView = {
	id: string;
	name: string;
	description: string;
	segment: string;
	/** The instant of the last change, compared by the page's version check. */
	version: string;
	schedule: Schedule;
	firstDayOfWeek: Weekday;
	/** `null` when the instance keeps events permanently. */
	deletionDate: Temporal.PlainDate | null;
	/** Slot keys of the event, in time order. */
	slots: string[];
	/** In joining order, each with their public id and the keys of the slots they marked. */
	participants: ParticipantView[];
};

/**
 * The version of event `id`, or `null` when the event no longer exists or has expired.
 */
export async function eventVersion(
	id: string,
	now = Temporal.Now.instant(),
): Promise<string | null> {
	const row = await liveEvent(db(), id, now, "read");

	return row === undefined ? null : Temporal.Instant.from(row.changedAt).toString();
}

/**
 * Everything anyone with the share link sees, or `undefined` for an unknown or expired
 * event.
 */
export async function readEvent(
	id: string,
	now = Temporal.Now.instant(),
): Promise<EventView | undefined> {
	const row = await liveEvent(db(), id, now, "read");

	return row === undefined ? undefined : eventViewOf(db(), row);
}

/** The event `row` with its participants and their availability, read through `queries`. */
export async function eventViewOf(queries: Queries, row: EventRow): Promise<EventView> {
	const people = await queries
		.select({
			id: participants.id,
			publicId: participants.publicId,
			name: participants.displayName,
		})
		.from(participants)
		.where(eq(participants.eventId, row.id))
		.orderBy(asc(participants.createdAt), asc(participants.id));

	const keys = await availableKeys(
		queries,
		row,
		people.map((person) => person.id),
	);

	return viewOf(
		row,
		people.map((person) => ({
			id: person.publicId,
			name: person.name,
			available: keys.get(person.id) ?? [],
		})),
	);
}

function viewOf(row: EventRow, people: ParticipantView[]): EventView {
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
		participants: people,
	};
}
