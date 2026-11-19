// The final time: the window or poll option the organizer picked, as one dated occurrence in UTC.
import { optionKey } from "./poll";
import {
	type GridSchedule,
	type GridSlot,
	gridSlots,
	type PollSchedule,
	type Schedule,
	type Slot,
	slotKey,
} from "./schedule";

/** Whether a final time is picked. `sequence` counts the picks and changes, also after a clear. */
export type FinalTime =
	| { kind: "open"; sequence: number }
	| { kind: "chosen"; start: Temporal.Instant; end: Temporal.Instant; sequence: number };

export type FinalProblem = "final_not_in_event" | "final_date_wrong_weekday" | "date_in_past";

export type FinalRequest = {
	/** Keys of the window's slots, in any order. */
	slots: readonly string[];
	/** The date of a weekday event's occurrence; a dated event has none. */
	date?: Temporal.PlainDate | undefined;
};

export type FinalResult =
	| { ok: true; start: Temporal.Instant; end: Temporal.Instant }
	| { ok: false; problem: FinalProblem };

/** The start of a weekday slot on `date`, resolved as the dated slots are (ADR 0002). */
function occurrence(date: Temporal.PlainDate, minute: number, zone: string): Temporal.Instant {
	return date
		.toPlainDateTime()
		.add({ minutes: minute })
		.toZonedDateTime(zone, { disambiguation: "earlier" })
		.toInstant();
}

/** Whether `slots`, in time order, follow each other directly within one day. */
function isRun(slots: readonly GridSlot[], slotLength: number): boolean {
	return slots.every((slot, index) => {
		const previous = slots[index - 1];

		if (previous === undefined) {
			return true;
		}

		if (slot.kind === "dated" && previous.kind === "dated") {
			return slot.start.equals(previous.start.add({ minutes: slotLength }));
		}

		return (
			slot.kind === "weekday" &&
			previous.kind === "weekday" &&
			slot.weekday === previous.weekday &&
			slot.minute === previous.minute + slotLength
		);
	});
}

/**
 * The start and end of the window a request picks: a run of the event's slots, and for a
 * weekday event a date on the run's weekday that is not before `today` in the reference zone.
 */
export function finalWindow(
	schedule: Schedule,
	request: FinalRequest,
	now: Temporal.Instant,
): FinalResult {
	return schedule.kind === "poll"
		? finalOption(schedule, request)
		: gridWindow(schedule, request, now);
}

/** A poll's final time: exactly one of its options. */
function finalOption(schedule: PollSchedule, request: FinalRequest): FinalResult {
	const [key, ...more] = request.slots;
	const option = schedule.options.find((candidate) => optionKey(candidate) === key);

	if (option === undefined || more.length > 0 || request.date !== undefined) {
		return { ok: false, problem: "final_not_in_event" };
	}

	return { ok: true, start: option.start, end: option.end };
}

function gridWindow(
	schedule: GridSchedule,
	request: FinalRequest,
	now: Temporal.Instant,
): FinalResult {
	const wanted = new Set(request.slots);
	const slots = gridSlots(schedule).filter((slot) => wanted.has(slotKey(slot)));
	const first = slots[0];
	const last = slots.at(-1);
	const weekdays = schedule.days.mode === "weekdays";

	if (
		first === undefined ||
		last === undefined ||
		slots.length !== wanted.size ||
		!isRun(slots, schedule.slotLength) ||
		weekdays !== (request.date !== undefined)
	) {
		return { ok: false, problem: "final_not_in_event" };
	}

	const length = { minutes: schedule.slotLength };

	if (first.kind === "dated" && last.kind === "dated") {
		return { ok: true, start: first.start, end: last.start.add(length) };
	}

	const { date } = request;

	if (date === undefined || first.kind !== "weekday" || last.kind !== "weekday") {
		return { ok: false, problem: "final_not_in_event" };
	}

	if (date.dayOfWeek !== first.weekday) {
		return { ok: false, problem: "final_date_wrong_weekday" };
	}

	const today = now.toZonedDateTimeISO(schedule.referenceZone).toPlainDate();

	if (Temporal.PlainDate.compare(date, today) < 0) {
		return { ok: false, problem: "date_in_past" };
	}

	const zone = schedule.referenceZone;

	return {
		ok: true,
		start: occurrence(date, first.minute, zone),
		end: occurrence(date, last.minute, zone).add(length),
	};
}

/** The date of the final time in the reference zone, the date a weekday event picked. */
export function finalDate(start: Temporal.Instant, schedule: Schedule): Temporal.PlainDate {
	return start.toZonedDateTimeISO(schedule.referenceZone).toPlainDate();
}

/** Keys of the event's slots inside the final time; a weekday slot by its occurrence that day. */
export function finalSlotKeys(final: FinalTime, schedule: Schedule): string[] {
	if (final.kind === "open") {
		return [];
	}

	// A poll's options differ in start or end, so these name the one that was picked.
	if (schedule.kind === "poll") {
		return schedule.options.flatMap((option) =>
			option.start.equals(final.start) && option.end.equals(final.end) ? [optionKey(option)] : [],
		);
	}

	const date = finalDate(final.start, schedule);

	const inside = (start: Temporal.Instant) =>
		Temporal.Instant.compare(start, final.start) >= 0 &&
		Temporal.Instant.compare(start, final.end) < 0;

	return gridSlots(schedule).flatMap((slot) => {
		if (slot.kind === "dated") {
			return inside(slot.start) ? [slotKey(slot)] : [];
		}

		const start = occurrence(date, slot.minute, schedule.referenceZone);

		return slot.weekday === date.dayOfWeek && inside(start) ? [slotKey(slot)] : [];
	});
}

/** Whether removing `removed` from the event takes a slot of its final time. */
export function clearsFinal(final: FinalTime, schedule: Schedule, removed: readonly Slot[]) {
	const inside = new Set(finalSlotKeys(final, schedule));

	return removed.some((slot) => inside.has(slotKey(slot)));
}
