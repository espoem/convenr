// Creating and reading events.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import { events, participants, pollOptions } from "@/db/schema";
import { characterCount } from "@/domain/display-name";
import { eventSegment } from "@/domain/event-address";
import { type EditProblem, scheduleProblems } from "@/domain/event-edit";
import { type FinalTime, finalSlotKeys } from "@/domain/final-time";
import { MAX_OPTIONS } from "@/domain/poll";
import { newPublicId } from "@/domain/public-id";
import type { Deletion } from "@/domain/retention";
import {
	type GridSchedule,
	MAX_DATES,
	type PollOption,
	type Schedule,
	type ScheduleIssue,
	scheduleSlots,
	slotKey,
	SLOT_LENGTHS,
} from "@/domain/schedule";
import type { EventVersion } from "@/lib/event-version";

import { FIELD_CODES, fieldErrors } from "./api/field-codes";
import {
	deletionOfRow,
	type EventRow,
	finalOf,
	liveEvent,
	type ParticipantView,
	type Queries,
	responseLevels,
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

const common = {
	name: z
		.string()
		.trim()
		.min(1)
		.refine((name) => characterCount(name) <= EVENT_NAME_MAX_LENGTH, tooLong),
	description: z
		.string()
		.trim()
		.refine((text) => characterCount(text) <= DESCRIPTION_MAX_LENGTH, tooLong),
	referenceZone: z.string().refine(isTimeZone, failsAs("unknown_time_zone")),
};

/** An instant at a whole minute, as an option starts and ends. */
const wholeMinute = z.iso
	.datetime({ offset: true })
	.transform((text) => Temporal.Instant.from(text))
	.refine((instant) => instant.epochNanoseconds % 60_000_000_000n === 0n, failsAs("invalid_value"));

/** An option the event keeps, by id, or a new one, by its times. */
const optionInput = z.union([
	z.object({ id: z.string() }),
	z.object({ start: wholeMinute, end: wholeMinute }),
]);

const gridEventSchema = z.object({
	...common,
	kind: z.literal("grid"),
	days: z.discriminatedUnion("mode", [
		z.object({ mode: z.literal("range"), first: isoDate, last: isoDate }),
		// The upper bounds only stop oversized input; validateSchedule applies the real limits.
		z.object({ mode: z.literal("dates"), dates: z.array(isoDate).max(MAX_DATES * 2) }),
		z.object({ mode: z.literal("weekdays"), weekdays: z.array(weekday).max(14) }),
	]),
	dailyStart: z.int(),
	dailyEnd: z.int(),
	slotLength: z.literal(SLOT_LENGTHS),
	firstDayOfWeek: weekday,
});

const pollEventSchema = z.object({
	...common,
	kind: z.literal("poll"),
	// The upper bound only stops oversized input; validatePoll applies the real limits.
	options: z.array(optionInput).max(MAX_OPTIONS * 2),
});

export const newEventSchema = z.discriminatedUnion("kind", [gridEventSchema, pollEventSchema]);

export type NewEvent = z.input<typeof newEventSchema>;

export type GridEventInput = z.input<typeof gridEventSchema>;

export type PollEventInput = z.input<typeof pollEventSchema>;

/**
 * The fields a change names, laid over the stored ones before the result is checked as a whole.
 * A schedule is replaced as a whole, with its kind; a field the resulting kind lacks is ignored.
 */
export type EventChange = Partial<
	Omit<GridEventInput, "kind"> & Omit<PollEventInput, "kind"> & { kind: NewEvent["kind"] }
>;

type ParsedEvent = z.output<typeof newEventSchema>;

type OptionInput = z.output<typeof optionInput>;

/**
 * The poll options `input` asks for: kept ones by id from `stored`, and new ones with a new id.
 * An id the event does not have is a problem at its place in the list.
 */
export function resolvedOptions(
	input: readonly OptionInput[],
	stored: readonly PollOption[],
): { ok: true; options: PollOption[] } | { ok: false; problems: EventProblem[] } {
	const byId = new Map(stored.map((option) => [option.id, option]));
	const options: PollOption[] = [];
	const problems: EventProblem[] = [];

	for (const [index, option] of input.entries()) {
		if (!("id" in option)) {
			options.push({ id: newPublicId(), start: option.start, end: option.end });
			continue;
		}

		const kept = byId.get(option.id);

		if (kept === undefined) {
			problems.push({ kind: "rule", code: "unknown_option", path: ["options", index, "id"] });
		} else {
			options.push(kept);
		}
	}

	return problems.length > 0 ? { ok: false, problems } : { ok: true, options };
}

/**
 * The schedule a parsed input describes, with poll options resolved against `stored`, the
 * options the event has, or the problems of an unknown option. The options stay in the order
 * of the request, so that a problem points at the option as it was sent.
 */
export function scheduleOfInput(
	parsed: ParsedEvent,
	stored: readonly PollOption[],
): { ok: true; schedule: Schedule } | { ok: false; problems: EventProblem[] } {
	if (parsed.kind === "grid") {
		const { days, dailyStart, dailyEnd, slotLength, referenceZone, firstDayOfWeek } = parsed;

		return {
			ok: true,
			schedule: {
				kind: "grid",
				days,
				dailyStart,
				dailyEnd,
				slotLength,
				referenceZone,
				firstDayOfWeek,
			},
		};
	}

	const options = resolvedOptions(parsed.options, stored);

	return options.ok
		? {
				ok: true,
				schedule: { kind: "poll", options: options.options, referenceZone: parsed.referenceZone },
			}
		: options;
}

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

function storedDays(days: GridSchedule["days"]) {
	const none = { rangeFirst: null, rangeLast: null, dates: null, weekdays: null };

	if (days.mode === "range") {
		return { ...none, rangeFirst: days.first.toString(), rangeLast: days.last.toString() };
	}

	if (days.mode === "dates") {
		return { ...none, dates: days.dates.map(String) };
	}

	return { ...none, weekdays: days.weekdays };
}

/** The event columns of a schedule; a poll leaves every column of a grid empty. */
export function scheduleColumns(schedule: Schedule) {
	if (schedule.kind === "poll") {
		return {
			kind: "poll",
			dayMode: null,
			rangeFirst: null,
			rangeLast: null,
			dates: null,
			weekdays: null,
			dailyStart: null,
			dailyEnd: null,
			slotLength: null,
			firstDayOfWeek: null,
			referenceZone: schedule.referenceZone,
		} as const;
	}

	return {
		kind: "grid",
		dayMode: schedule.days.mode,
		...storedDays(schedule.days),
		dailyStart: schedule.dailyStart,
		dailyEnd: schedule.dailyEnd,
		slotLength: schedule.slotLength,
		firstDayOfWeek: schedule.firstDayOfWeek,
		referenceZone: schedule.referenceZone,
	} as const;
}

/** The option rows of `options` for event `eventId`. */
export function optionRows(eventId: string, options: readonly PollOption[]) {
	return options.map((option) => ({
		eventId,
		id: option.id,
		start: option.start.toString(),
		end: option.end.toString(),
	}));
}

/** Who owns a new event: nobody, or the signed-in account that creates it. */
export type NewOwner = { kind: "none" } | { kind: "account"; accountId: string };

const NO_OWNER: NewOwner = { kind: "none" };

/** Creates an event. */
export async function createEvent(
	input: NewEvent,
	now = Temporal.Now.instant(),
	owner: NewOwner = NO_OWNER,
): Promise<CreateEventResult> {
	const parsed = newEventSchema.safeParse(input, { reportInput: true });

	if (!parsed.success) {
		return { ok: false, problems: inputProblems(parsed.error) };
	}

	const described = scheduleOfInput(parsed.data, []);

	if (!described.ok) {
		return described;
	}

	const { schedule } = described;
	const issues = scheduleProblems(schedule, now);

	if (issues.length > 0) {
		return { ok: false, problems: ruleProblems(issues) };
	}

	const adminSecret = newSecret("admin");

	// About 70 random bits make a collision negligible; the primary key would refuse one.
	const id = newPublicId();

	const row = await db().transaction(async (tx): Promise<EventRow> => {
		const [inserted] = await tx
			.insert(events)
			.values({
				id,
				name: parsed.data.name,
				description: parsed.data.description,
				...scheduleColumns(schedule),
				adminSecretHash: hashSecret(adminSecret),
				ownerId: owner.kind === "account" ? owner.accountId : null,
				createdAt: now.toString(),
				changedAt: now.toString(),
			})
			.returning();

		if (inserted === undefined) {
			throw new Error("The event insert returned no row.");
		}

		const options = schedule.kind === "poll" ? optionRows(id, schedule.options) : [];

		if (options.length > 0) {
			await tx.insert(pollOptions).values(options);
		}

		await countCreated(tx, now);

		return { ...inserted, options };
	});

	// Built from the inserted row, so the answer does not depend on a later read finding the event.
	return { ok: true, adminSecret, event: viewOf(row, []) };
}

export type EventView = {
	id: string;
	name: string;
	description: string;
	segment: string;
	/** Compared by the page's version check. */
	version: EventVersion;
	schedule: Schedule;
	deletion: Deletion;
	final: FinalTime;
	/** Keys of the event's slots inside the final time, in time order; empty while it is open. */
	finalSlots: string[];
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
): Promise<EventVersion | null> {
	const row = await liveEvent(db(), id, now, "read");

	return row === undefined ? null : row.version;
}

/**
 * Everything anyone with the share link sees, or `undefined` for an unknown or expired
 * event.
 */
export async function readEvent(
	id: string,
	now = Temporal.Now.instant(),
): Promise<EventView | undefined> {
	return db().transaction(
		async (tx) => {
			const row = await liveEvent(tx, id, now, "read");

			return row === undefined ? undefined : eventViewOf(tx, row);
		},
		{ isolationLevel: "repeatable read", accessMode: "read only" },
	);
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

	const levels = await responseLevels(
		queries,
		row,
		people.map((person) => person.id),
	);

	return viewOf(
		row,
		people.map((person) => ({
			id: person.publicId,
			name: person.name,
			levels: levels.get(person.id) ?? {},
		})),
	);
}

function viewOf(row: EventRow, people: ParticipantView[]): EventView {
	const schedule = scheduleOf(row);
	const final = finalOf(row);

	return {
		id: row.id,
		name: row.name,
		description: row.description,
		segment: eventSegment(row.id, row.name),
		version: row.version,
		schedule,
		deletion: deletionOfRow(row),
		final,
		finalSlots: finalSlotKeys(final, schedule),
		slots: scheduleSlots(schedule).map((slot) => slotKey(slot)),
		participants: people,
	};
}
