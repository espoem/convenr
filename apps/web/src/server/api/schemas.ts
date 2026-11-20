// Shapes of the public API's requests and responses. They check form only, so that JSON
// Schema can express every check; the server functions apply the rules of an event. A request
// object is strict, so a misspelt field is refused instead of ignored; a response object is
// not, since a client must accept fields added later.
import { z } from "zod";

import { MINUTES_PER_DAY, SLOT_LENGTHS } from "@/domain/schedule";
import { MAX_PARTICIPANTS } from "@/server/participants";

/** ISO day of week: 1 is Monday, 7 is Sunday. */
export const weekdaySchema = z.literal([1, 2, 3, 4, 5, 6, 7]);

const isoDate = z.iso.date();

/** A wall-clock time `HH:MM` from 00:00 to 23:59. */
const startTime = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);

/** A wall-clock time `HH:MM`, where 24:00 is the end of the day. */
const endTime = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/u);

const datedSlot = { start: z.iso.datetime() };

const weekdaySlot = {
	weekday: weekdaySchema,
	minute: z
		.int()
		.min(0)
		.max(MINUTES_PER_DAY - 1),
};

/** A slot of a dated event: its start as an RFC 3339 instant in UTC. */
export const datedSlotSchema = z.object(datedSlot);

/** A slot of a weekday event: a wall-clock time in the reference zone, with no date. */
export const weekdaySlotSchema = z.object(weekdaySlot);

const optionSlot = { option: z.string() };

/** An option of a poll, answered as a slot is, by its id. */
export const optionSlotSchema = z.object(optionSlot);

export const slotSchema = z.union([datedSlotSchema, weekdaySlotSchema, optionSlotSchema]);

/**
 * A slot in a request. A dated slot's start may carry any offset, such as the `+00:00` that
 * many libraries write for UTC; the answer names it in UTC with `Z`.
 */
const slotInputSchema = z.union([
	z.strictObject({ start: z.iso.datetime({ offset: true }) }),
	z.strictObject(weekdaySlot),
	z.strictObject(optionSlot),
]);

const times = {
	dailyStart: startTime,
	dailyEnd: endTime,
	slotMinutes: z.literal(SLOT_LENGTHS),
};

const datesDays = { mode: z.literal("dates"), dates: z.array(isoDate) };
const rangeDays = { mode: z.literal("range"), first: isoDate, last: isoDate };
const weekdayDays = { mode: z.literal("weekdays"), weekdays: z.array(weekdaySchema) };

/**
 * A poll option in a request: one the event keeps, by id, or a new one, by its start and end as
 * RFC 3339 instants at whole minutes. An option cannot be changed; a new time is a new option.
 */
const optionInputSchema = z.union([
	z.strictObject({ id: z.string() }),
	z.strictObject({
		start: z.iso.datetime({ offset: true }),
		end: z.iso.datetime({ offset: true }),
	}),
]);

/** An option of a poll: a start and an end on one date in the reference zone, in UTC. */
export const optionSchema = z.object({
	id: z.string(),
	start: z.iso.datetime(),
	end: z.iso.datetime(),
});

/** The schedule a request sends; the server derives the slots. */
export const scheduleInputSchema = z.discriminatedUnion("mode", [
	z.strictObject({ ...datesDays, ...times }),
	z.strictObject({ ...rangeDays, ...times }),
	z.strictObject({ ...weekdayDays, ...times }),
	/** 2 to 20 options. An option a change leaves out is removed with its answers. */
	z.strictObject({ mode: z.literal("poll"), options: z.array(optionInputSchema) }),
]);

/** The schedule of a response, with every slot of the event in time order. */
export const scheduleSchema = z.discriminatedUnion("mode", [
	z.object({ ...datesDays, ...times, slots: z.array(datedSlotSchema) }),
	z.object({ ...rangeDays, ...times, slots: z.array(datedSlotSchema) }),
	z.object({ ...weekdayDays, ...times, slots: z.array(weekdaySlotSchema) }),
	/** The options in time order; each is one slot. */
	z.object({
		mode: z.literal("poll"),
		options: z.array(optionSchema),
		slots: z.array(optionSlotSchema),
	}),
]);

export const retentionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("until"), date: isoDate }),
	z.object({ kind: z.literal("kept") }),
]);

/** A participant by public id. Nothing says whether they have a password. */
export const participantSchema = z.object({
	id: z.string(),
	name: z.string(),
	/** Every slot with a level, so a client that knows no levels reads if need be as available. */
	availability: z.array(slotSchema),
	/** The slots of `availability` at if need be. */
	ifNeedBe: z.array(slotSchema),
});

/** The final time, as one dated occurrence in UTC also for a weekday event. */
export const finalSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("open") }),
	z.object({
		kind: z.literal("chosen"),
		start: z.iso.datetime(),
		end: z.iso.datetime(),
		/** How many times a final time was picked or changed, as in the calendar file. */
		sequence: z.int().min(1),
		/** The event's slots inside the final time, in time order; for a poll, its one option. */
		slots: z.array(slotSchema),
	}),
]);

/**
 * A run of the event's slots in one day, or a poll's one option; a weekday event also names
 * the date it falls on.
 */
export const finalRequestSchema = z.strictObject({
	slots: z.array(slotInputSchema).min(1),
	/** Exactly for a weekday event: a date on the slots' weekday, not before today. */
	date: isoDate.optional(),
});

export const eventSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	/** IANA zone name. */
	referenceZone: z.string(),
	/** The day a grid's weeks start on; a poll has none. */
	firstDayOfWeek: weekdaySchema.optional(),
	schedule: scheduleSchema,
	retention: retentionSchema,
	final: finalSchema,
	/** In joining order. */
	participants: z.array(participantSchema),
});

export const createEventRequestSchema = z.strictObject({
	name: z.string(),
	description: z.string().optional(),
	referenceZone: z.string(),
	/** Monday when left out. A poll has no first day of the week and ignores it. */
	firstDayOfWeek: weekdaySchema.optional(),
	schedule: scheduleInputSchema,
});

/** The admin secret is shown only here and cannot be recovered. */
export const createdEventSchema = z.object({ event: eventSchema, adminSecret: z.string() });

/** Fields left out keep their values; a schedule is replaced as a whole. */
export const updateEventRequestSchema = z.strictObject({
	name: z.string().optional(),
	description: z.string().optional(),
	referenceZone: z.string().optional(),
	firstDayOfWeek: weekdaySchema.optional(),
	schedule: scheduleInputSchema.optional(),
	/** The `ETag` of a `confirmation_required` refusal, to accept the loss it counted. */
	confirmedVersion: z.string().optional(),
});

/** At most one of `password` and `newPassword`. */
export const joinRequestSchema = z.strictObject({
	name: z.string(),
	/** The password of a name that already has one. A name nobody uses is refused with it. */
	password: z.string().optional(),
	/** A password for a name nobody uses yet. A name already used is refused with it. */
	newPassword: z.string().optional(),
});

export const joinedSchema = z.object({
	participant: participantSchema,
	participantToken: z.string(),
});

/** Replaces the availability as a whole. */
export const availabilityRequestSchema = z.strictObject({
	availability: z.array(slotInputSchema),
	/** Left out, every slot that stays keeps its level and a new slot is available. */
	ifNeedBe: z.array(slotInputSchema).optional(),
});

export const setPasswordRequestSchema = z.strictObject({
	newPassword: z.string(),
	/** Needed exactly when a password is already set. */
	currentPassword: z.string().optional(),
});

export const removePasswordRequestSchema = z.strictObject({ currentPassword: z.string() });

/** A whole number written with decimal digits only, so `0x10`, `1e2` and `+5` are not numbers. */
const decimalDigits = z.string().regex(/^\d+$/u).transform(Number);

/** Query values are text. Describe the parsed number: the parameter is an integer on the wire. */
export const windowsQuerySchema = z.object({
	/** One slot when left out. */
	minMinutes: decimalDigits.pipe(z.int().min(1).max(MINUTES_PER_DAY)).optional(),
	/** The most people in any window when left out. */
	minPeople: decimalDigits.pipe(z.int().min(1).max(MAX_PARTICIPANTS)).optional(),
});

export const windowsSchema = z.object({
	/** The filters applied, with the defaults filled in. */
	minMinutes: z.int().min(1).max(MINUTES_PER_DAY),
	minPeople: z.int().min(1),
	/** At most five: the highest score first, then the most people, the longest, the earliest. */
	windows: z.array(
		z.object({
			slots: z.array(slotSchema).min(1),
			minutes: z.int().min(1),
			/** Public ids of the participants with a level in every slot. */
			participantIds: z.array(z.string()),
			/** How many of them are at if need be in at least one slot. */
			ifNeedBe: z.int().min(0),
			/** 1 for each available person and ½ for each at if need be. */
			score: z.number().multipleOf(0.5).min(0),
		}),
	),
});

/**
 * A field at fault: in the request body by RFC 6901 JSON Pointer, or a query parameter. The
 * code is a field code such as `required` or a rule code such as `date_in_past`.
 */
export const fieldErrorSchema = z.union([
	z.object({ pointer: z.string(), code: z.string() }),
	z.object({ parameter: z.string(), code: z.string() }),
]);

/** RFC 9457 problem details. */
export const problemSchema = z.object({
	/** `https://convenr.party/problems/` followed by the code. */
	type: z.string(),
	status: z.int().min(100).max(599),
	title: z.string(),
	code: z.string(),
	errors: z.array(fieldErrorSchema).optional(),
	/** With `too_many_attempts`: when a password may be tried again. */
	retryAt: z.iso.datetime().optional(),
	/** With `confirmation_required`: how many participants would lose availability. */
	losing: z.int().min(0).optional(),
	/** With `confirmation_required`: whether the change would clear the final time. */
	clearsFinal: z.boolean().optional(),
});

export type CreateEventRequest = z.output<typeof createEventRequestSchema>;

export type UpdateEventRequest = z.output<typeof updateEventRequestSchema>;

export type JoinRequest = z.output<typeof joinRequestSchema>;

export type AvailabilityRequest = z.output<typeof availabilityRequestSchema>;

export type FinalRequestBody = z.output<typeof finalRequestSchema>;

export type ScheduleInput = z.output<typeof scheduleInputSchema>;

export type SlotBody = z.output<typeof slotSchema>;

export type EventBody = z.output<typeof eventSchema>;

export type ParticipantBody = z.output<typeof participantSchema>;

export type WindowsBody = z.output<typeof windowsSchema>;

export type FieldError = z.output<typeof fieldErrorSchema>;

export type ProblemBody = z.output<typeof problemSchema>;
