// Shapes of the public API's requests and responses. They check form only, so that JSON
// Schema can express every check; the server functions apply the rules of an event. A request
// object is strict, so a misspelt field is refused instead of ignored; a response object is
// not, since a client must accept fields added later.
import { z } from "zod";

import { MINUTES_PER_DAY, SLOT_LENGTHS } from "@/domain/schedule";

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

export const slotSchema = z.union([datedSlotSchema, weekdaySlotSchema]);

/** A slot in a request. */
const slotInputSchema = z.union([z.strictObject(datedSlot), z.strictObject(weekdaySlot)]);

const times = {
	dailyStart: startTime,
	dailyEnd: endTime,
	slotMinutes: z.literal(SLOT_LENGTHS),
};

const datesDays = { mode: z.literal("dates"), dates: z.array(isoDate) };
const rangeDays = { mode: z.literal("range"), first: isoDate, last: isoDate };
const weekdayDays = { mode: z.literal("weekdays"), weekdays: z.array(weekdaySchema) };

/** The schedule a request sends; the server derives the slots. */
export const scheduleInputSchema = z.discriminatedUnion("mode", [
	z.strictObject({ ...datesDays, ...times }),
	z.strictObject({ ...rangeDays, ...times }),
	z.strictObject({ ...weekdayDays, ...times }),
]);

/** The schedule of a response, with every slot of the event in time order. */
export const scheduleSchema = z.discriminatedUnion("mode", [
	z.object({ ...datesDays, ...times, slots: z.array(datedSlotSchema) }),
	z.object({ ...rangeDays, ...times, slots: z.array(datedSlotSchema) }),
	z.object({ ...weekdayDays, ...times, slots: z.array(weekdaySlotSchema) }),
]);

export const retentionSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("until"), date: isoDate }),
	z.object({ kind: z.literal("kept") }),
]);

/** A participant by public id. Nothing says whether they have a password. */
export const participantSchema = z.object({
	id: z.string(),
	name: z.string(),
	availability: z.array(slotSchema),
});

export const eventSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	/** IANA zone name. */
	referenceZone: z.string(),
	firstDayOfWeek: weekdaySchema,
	schedule: scheduleSchema,
	retention: retentionSchema,
	/** In joining order. */
	participants: z.array(participantSchema),
});

export const createEventRequestSchema = z.strictObject({
	name: z.string(),
	description: z.string().optional(),
	referenceZone: z.string(),
	/** Monday when left out. */
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
	/** How many participants the client agreed may lose part of their availability. */
	confirmedLosing: z.int().min(0).optional(),
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
});

export const setPasswordRequestSchema = z.strictObject({
	newPassword: z.string(),
	/** Needed exactly when a password is already set. */
	currentPassword: z.string().optional(),
});

export const removePasswordRequestSchema = z.strictObject({ currentPassword: z.string() });

export const windowsQuerySchema = z.object({
	/** One slot when left out. */
	minMinutes: z.coerce.number().int().min(1).max(MINUTES_PER_DAY).optional(),
	/** The most people in any window when left out. */
	minPeople: z.coerce.number().int().min(1).max(100).optional(),
});

export const windowsSchema = z.object({
	/** The filters applied, with the defaults filled in. */
	minMinutes: z.int().min(1).max(MINUTES_PER_DAY),
	minPeople: z.int().min(1),
	/** At most five, the most people first, then the longest, then the earliest. */
	windows: z.array(
		z.object({
			slots: z.array(slotSchema).min(1),
			minutes: z.int().min(1),
			/** Public ids of the participants available in every slot. */
			participantIds: z.array(z.string()),
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
});

export type CreateEventRequest = z.output<typeof createEventRequestSchema>;

export type UpdateEventRequest = z.output<typeof updateEventRequestSchema>;

export type JoinRequest = z.output<typeof joinRequestSchema>;

export type ScheduleInput = z.output<typeof scheduleInputSchema>;

export type SlotBody = z.output<typeof slotSchema>;

export type EventBody = z.output<typeof eventSchema>;

export type ParticipantBody = z.output<typeof participantSchema>;

export type WindowsBody = z.output<typeof windowsSchema>;

export type FieldError = z.output<typeof fieldErrorSchema>;

export type ProblemBody = z.output<typeof problemSchema>;
