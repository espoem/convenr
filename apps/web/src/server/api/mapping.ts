// The one place that maps between the API's shapes and the server's types. Slot keys stay
// inside the server: a response names a dated slot by its start and a weekday slot by weekday
// and minute.
import { bestWindows, maximalWindows, mostPeople, windowTally } from "@/domain/best-windows";
import type { FinalProblem, FinalRequest } from "@/domain/final-time";
import { datedLayout, weekdayLayout } from "@/domain/grid-layout";
import { scoreOf, slotsAt } from "@/domain/levels";
import { type Schedule, scheduleSlots, type Slot, slotKey } from "@/domain/schedule";
import { parseVersion } from "@/lib/event-version";
import type { ParticipantView } from "@/server/event-rows";
import type { EventProblem, EventView, NewEvent } from "@/server/events";
import type { Confirmation } from "@/server/manage";
import type { JoinPassword, PasswordRefusal } from "@/server/participants";

import { entityTag, json, jsonPointer, problem, type ProblemCode, unauthorized } from "./http";
import {
	type CreateEventRequest,
	type EventBody,
	eventSchema,
	type FinalRequestBody,
	type JoinRequest,
	type ParticipantBody,
	type ScheduleInput,
	type SlotBody,
	type UpdateEventRequest,
	type WindowsBody,
} from "./schemas";

/** Minutes after midnight of a checked `HH:MM` time. */
export function clockMinutes(time: string): number {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** `HH:MM` of minutes after midnight; 1440 is `24:00`. */
export function clockTime(minutes: number): string {
	const hours = String(Math.floor(minutes / 60)).padStart(2, "0");

	return `${hours}:${String(minutes % 60).padStart(2, "0")}`;
}

function scheduleFields(schedule: ScheduleInput) {
	const days = (): NewEvent["days"] => {
		switch (schedule.mode) {
			case "dates":
				return { mode: "dates", dates: schedule.dates };
			case "range":
				return { mode: "range", first: schedule.first, last: schedule.last };
			case "weekdays":
				return { mode: "weekdays", weekdays: schedule.weekdays };
		}
	};

	return {
		days: days(),
		dailyStart: clockMinutes(schedule.dailyStart),
		dailyEnd: clockMinutes(schedule.dailyEnd),
		slotLength: schedule.slotMinutes,
	};
}

export function newEventOf(request: CreateEventRequest): NewEvent {
	return {
		name: request.name,
		description: request.description ?? "",
		referenceZone: request.referenceZone,
		firstDayOfWeek: request.firstDayOfWeek ?? 1,
		...scheduleFields(request.schedule),
	};
}

/**
 * The loss a change accepts: the `ETag` of the refusal that counted it, quoted or not. Text that
 * names no version accepts nothing, so the change is refused again.
 */
export function confirmationOf(request: UpdateEventRequest): Confirmation {
	const version = parseVersion((request.confirmedVersion ?? "").replace(/^"(.*)"$/u, "$1"));

	return version === undefined ? { kind: "none" } : { kind: "version", version };
}

/** The fields a change names; the server keeps the stored value of every other one. */
export function eventChangeOf(request: UpdateEventRequest): Partial<NewEvent> {
	const { name, description, referenceZone, firstDayOfWeek, schedule } = request;
	const change: Partial<NewEvent> = schedule === undefined ? {} : scheduleFields(schedule);

	if (name !== undefined) {
		change.name = name;
	}

	if (description !== undefined) {
		change.description = description;
	}

	if (referenceZone !== undefined) {
		change.referenceZone = referenceZone;
	}

	if (firstDayOfWeek !== undefined) {
		change.firstDayOfWeek = firstDayOfWeek;
	}

	return change;
}

/** Where a field of `NewEvent` sits in a request body: the schedule fields moved into `schedule`. */
function requestPath(path: PropertyKey[]): PropertyKey[] {
	const [field, ...rest] = path;

	if (field === "days") {
		return ["schedule", ...rest];
	}

	if (field === "dailyStart" || field === "dailyEnd") {
		return ["schedule", field, ...rest];
	}

	return field === "slotLength" ? ["schedule", "slotMinutes", ...rest] : path;
}

/**
 * A refused event. A value of the wrong form is an invalid request; otherwise the first broken
 * rule names the problem, and a locked field, which no edit of the values can fix, comes first.
 */
export function eventProblemResponse(problems: EventProblem[]): Response {
	const errors = problems.map((found) => ({
		pointer: jsonPointer(requestPath(found.path)),
		code: found.code,
	}));

	const rules = problems.flatMap((found) => (found.kind === "rule" ? [found.code] : []));

	const code: ProblemCode =
		rules.length < problems.length
			? "invalid_request"
			: rules.includes("field_locked")
				? "field_locked"
				: (rules[0] ?? "invalid_request");

	return problem(code, { errors });
}

/**
 * What a join body says about a password, or `undefined` when it sends both fields: a name is
 * either used or new, so one of them would always be refused.
 */
export function joinPasswordOf(body: JoinRequest): JoinPassword | undefined {
	const { password, newPassword } = body;

	if (password !== undefined && newPassword !== undefined) {
		return undefined;
	}

	if (password !== undefined) {
		return { kind: "current", password };
	}

	return newPassword === undefined ? { kind: "none" } : { kind: "new", password: newPassword };
}

export type Refusal =
	| PasswordRefusal
	| {
			ok: false;
			problem:
				| "not_found"
				| "not_joined"
				| "invalid_name"
				| "invalid_password"
				| "event_full"
				| "no_password"
				| "name_exists"
				| "name_unknown";
	  };

/**
 * The body fields of a route that a refusal can concern, as JSON Pointers: the password that
 * proves who the participant is, and the password being set.
 */
export type PasswordFields = { current: string; new: string };

/** A problem whose one field error, at `pointer`, carries the problem's own code. */
function at(pointer: string, code: ProblemCode): Response {
	return problem(code, { errors: [{ pointer, code }] });
}

/**
 * A refused join or password change, pointing at the body field the refusal concerns. An
 * unknown token gets the same answer as a wrong secret.
 */
export function refusalResponse(
	refusal: Refusal,
	fields: PasswordFields,
	now = Temporal.Now.instant(),
): Response {
	switch (refusal.problem) {
		case "not_joined":
			return unauthorized();
		case "invalid_name":
			return at("/name", "invalid_name");
		case "invalid_password":
		case "name_exists":
			return at(fields.new, refusal.problem);
		case "password_required":
		case "wrong_password":
		case "no_password":
		case "name_unknown":
			return at(fields.current, refusal.problem);
		case "too_many_attempts": {
			const seconds = Math.ceil(refusal.retryAt.since(now).total("seconds"));

			return problem("too_many_attempts", {
				members: { retryAt: refusal.retryAt.toString() },
				headers: { "Retry-After": String(Math.max(1, seconds)) },
			});
		}

		case "not_found":
		case "event_full":
			return problem(refusal.problem);
	}
}

function slotBody(slot: Slot): SlotBody {
	return slot.kind === "dated"
		? { start: slot.start.toString() }
		: { weekday: slot.weekday, minute: slot.minute };
}

/** The server's key of a slot in a request. A slot of the other mode gives a key no event has. */
export function slotKeyOf(body: SlotBody): string {
	return "start" in body
		? slotKey({ kind: "dated", start: Temporal.Instant.from(body.start) })
		: slotKey({ kind: "weekday", weekday: body.weekday, minute: body.minute });
}

/** The slots among `keys`, in time order. */
function slotsOf(slots: readonly Slot[], keys: readonly string[]): SlotBody[] {
	const chosen = new Set(keys);

	return slots.flatMap((slot) => (chosen.has(slotKey(slot)) ? [slotBody(slot)] : []));
}

export function participantBody(participant: ParticipantView, schedule: Schedule): ParticipantBody {
	const slots = scheduleSlots(schedule);

	return {
		id: participant.id,
		name: participant.name,
		availability: slotsOf(slots, Object.keys(participant.levels)),
		ifNeedBe: slotsOf(slots, slotsAt(participant.levels, "if_need_be")),
	};
}

function scheduleBody(schedule: Schedule): EventBody["schedule"] {
	const slots = scheduleSlots(schedule);

	const times = {
		dailyStart: clockTime(schedule.dailyStart),
		dailyEnd: clockTime(schedule.dailyEnd),
		slotMinutes: schedule.slotLength,
	};

	const dated = slots.flatMap((slot) =>
		slot.kind === "dated" ? [{ start: slot.start.toString() }] : [],
	);

	const { days } = schedule;

	switch (days.mode) {
		case "dates":
			return { mode: "dates", dates: days.dates.map(String), ...times, slots: dated };
		case "range":
			return {
				mode: "range",
				first: days.first.toString(),
				last: days.last.toString(),
				...times,
				slots: dated,
			};
		case "weekdays":
			return {
				mode: "weekdays",
				weekdays: days.weekdays,
				...times,
				slots: slots.flatMap((slot) =>
					slot.kind === "weekday" ? [{ weekday: slot.weekday, minute: slot.minute }] : [],
				),
			};
	}
}

/** The event with its version as the entity tag. */
export function eventResponse(view: EventView): Response {
	const response = json(eventSchema, eventBody(view));

	response.headers.set("ETag", entityTag(view.version));

	return response;
}

function finalBody(view: EventView): EventBody["final"] {
	const { final } = view;

	if (final.kind === "open") {
		return { kind: "open" };
	}

	return {
		kind: "chosen",
		start: final.start.toString(),
		end: final.end.toString(),
		sequence: final.sequence,
		slots: slotsOf(scheduleSlots(view.schedule), view.finalSlots),
	};
}

/** The final time a request picks, with the server's slot keys. */
export function finalRequestOf(body: FinalRequestBody): FinalRequest {
	return {
		slots: body.slots.map((slot) => slotKeyOf(slot)),
		date: body.date === undefined ? undefined : Temporal.PlainDate.from(body.date),
	};
}

/** A refused final time, pointing at the slots or at the date. */
export function finalProblemResponse(code: FinalProblem): Response {
	const pointer = code === "final_not_in_event" ? "/slots" : "/date";

	return problem(code, { errors: [{ pointer, code }] });
}

export function eventBody(view: EventView): EventBody {
	return {
		id: view.id,
		name: view.name,
		description: view.description,
		referenceZone: view.schedule.referenceZone,
		firstDayOfWeek: view.firstDayOfWeek,
		schedule: scheduleBody(view.schedule),
		retention:
			view.deletionDate === null
				? { kind: "kept" }
				: { kind: "until", date: view.deletionDate.toString() },
		final: finalBody(view),
		participants: view.participants.map((participant) =>
			participantBody(participant, view.schedule),
		),
	};
}

/**
 * The best windows as the event page lists them, with a dated event's columns taken in the
 * reference zone, since a client has no zone of its own to show.
 */
export function windowsBody(
	view: EventView,
	filters: { minMinutes?: number | undefined; minPeople?: number | undefined },
): WindowsBody {
	const { schedule, firstDayOfWeek, participants } = view;

	const layout =
		schedule.days.mode === "weekdays"
			? weekdayLayout(view.slots, firstDayOfWeek)
			: datedLayout(view.slots, schedule.referenceZone, firstDayOfWeek);

	const all = maximalWindows(layout, schedule.slotLength, participants);
	const minMinutes = filters.minMinutes ?? schedule.slotLength;
	const minPeople = filters.minPeople ?? Math.max(mostPeople(all), 1);
	const columns = layout.blocks.flat();
	const slots = scheduleSlots(schedule);

	const windows = bestWindows(all, {
		minSlots: Math.ceil(minMinutes / schedule.slotLength),
		minPeople,
	}).map((window) => ({
		slots: slotsOf(
			slots,
			columns[window.column]?.cells.slice(window.first, window.last + 1).flat() ?? [],
		),
		minutes: (window.last - window.first + 1) * schedule.slotLength,
		participantIds: window.people.flatMap(({ person }) => {
			const found = participants[person];

			return found === undefined ? [] : [found.id];
		}),
		ifNeedBe: windowTally(window).ifNeedBe,
		score: scoreOf(windowTally(window)),
	}));

	return { minMinutes, minPeople, windows };
}
