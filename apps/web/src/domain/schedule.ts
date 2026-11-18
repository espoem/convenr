// Days, daily time range and slots of an event, as in ADR 0002.

export const SLOT_LENGTHS = [15, 30, 60] as const;

export type SlotLength = (typeof SLOT_LENGTHS)[number];

export const MAX_DATES = 31;
export const MINUTES_PER_DAY = 24 * 60;

/** ISO day of week: 1 is Monday, 7 is Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** The day of week `value` names, or `undefined` when it is not 1 to 7. */
export function toWeekday(value: number): Weekday | undefined {
	return WEEKDAYS.find((candidate) => candidate === value);
}

/** The seven days of the week in display order for a week starting on `first`. */
export function weekdaysFrom(first: Weekday): Weekday[] {
	return [...WEEKDAYS.slice(first - 1), ...WEEKDAYS.slice(0, first - 1)];
}

/** The allowed slot length `value` names, or `undefined`. */
export function toSlotLength(value: number): SlotLength | undefined {
	return SLOT_LENGTHS.find((candidate) => candidate === value);
}

export type EventDays =
	| { mode: "range"; first: Temporal.PlainDate; last: Temporal.PlainDate }
	| { mode: "dates"; dates: Temporal.PlainDate[] }
	| { mode: "weekdays"; weekdays: Weekday[] };

export type Schedule = {
	days: EventDays;
	/** Minutes after midnight in the reference zone, inclusive. */
	dailyStart: number;
	/** Minutes after midnight in the reference zone, exclusive. At most 1440. */
	dailyEnd: number;
	slotLength: SlotLength;
	/** IANA zone name. */
	referenceZone: string;
};

export type ScheduleProblem =
	| "no_days"
	| "range_reversed"
	| "too_many_dates"
	| "duplicate_day"
	| "date_in_past"
	| "out_of_day"
	| "end_not_after_start"
	| "not_on_slot_boundary";

export type DatedSlot = { kind: "dated"; start: Temporal.Instant };

export type WeekdaySlot = { kind: "weekday"; weekday: Weekday; minute: number };

export type Slot = DatedSlot | WeekdaySlot;

/** The stored identity of a slot, as a string that sets and maps can compare. */
export function slotKey(slot: Slot): string {
	return slot.kind === "dated" ? slot.start.toString() : `w${slot.weekday}-${slot.minute}`;
}

/** The calendar dates of a dated event in ascending order, without duplicates. */
export function eventDates(days: Exclude<EventDays, { mode: "weekdays" }>): Temporal.PlainDate[] {
	if (days.mode === "dates") {
		const unique = new Map(days.dates.map((date) => [date.toString(), date]));

		return [...unique.values()].toSorted((a, b) => Temporal.PlainDate.compare(a, b));
	}

	const dates: Temporal.PlainDate[] = [];

	// The cap stops the walk on a reversed or oversized range; validateSchedule reports those.
	for (
		let date = days.first;
		Temporal.PlainDate.compare(date, days.last) <= 0 && dates.length <= MAX_DATES;
		date = date.add({ days: 1 })
	) {
		dates.push(date);
	}

	return dates;
}

function dayProblems(
	days: EventDays,
	today: Temporal.PlainDate,
	keptDates: ReadonlySet<string>,
): ScheduleProblem[] {
	if (days.mode === "weekdays") {
		if (days.weekdays.length === 0) {
			return ["no_days"];
		}

		return new Set(days.weekdays).size === days.weekdays.length ? [] : ["duplicate_day"];
	}

	const problems: ScheduleProblem[] = [];

	if (days.mode === "range" && Temporal.PlainDate.compare(days.first, days.last) > 0) {
		return ["range_reversed"];
	}

	if (days.mode === "dates") {
		if (days.dates.length === 0) {
			return ["no_days"];
		}

		if (new Set(days.dates.map(String)).size !== days.dates.length) {
			problems.push("duplicate_day");
		}
	}

	const dates = eventDates(days);

	if (dates.length > MAX_DATES) {
		problems.push("too_many_dates");
	}

	const past = (date: Temporal.PlainDate) => Temporal.PlainDate.compare(date, today) < 0;

	if (dates.some((date) => past(date) && !keptDates.has(date.toString()))) {
		problems.push("date_in_past");
	}

	return problems;
}

function timeProblems(schedule: Schedule): ScheduleProblem[] {
	const { dailyStart, dailyEnd, slotLength } = schedule;

	if (dailyStart < 0 || dailyEnd > MINUTES_PER_DAY) {
		return ["out_of_day"];
	}

	if (dailyEnd <= dailyStart) {
		return ["end_not_after_start"];
	}

	return dailyStart % slotLength === 0 && dailyEnd % slotLength === 0
		? []
		: ["not_on_slot_boundary"];
}

/**
 * Problems that make a schedule invalid. `now` is the moment of the
 * change; a date before today in the reference zone is refused unless it is one of
 * `keptDates`, the dates an edited event already had.
 */
export function validateSchedule(
	schedule: Schedule,
	now: Temporal.Instant,
	keptDates: ReadonlySet<string> = new Set(),
): ScheduleProblem[] {
	const today = now.toZonedDateTimeISO(schedule.referenceZone).toPlainDate();

	return [...dayProblems(schedule.days, today, keptDates), ...timeProblems(schedule)];
}

/** The dates of a dated schedule as ISO strings; none for a weekday schedule. */
export function scheduleDates(schedule: Schedule): Set<string> {
	const { days } = schedule;

	return new Set(days.mode === "weekdays" ? [] : eventDates(days).map(String));
}

function* dailyMinutes(schedule: Schedule): Generator<number> {
	for (
		let minute = schedule.dailyStart;
		minute < schedule.dailyEnd;
		minute += schedule.slotLength
	) {
		yield minute;
	}
}

/**
 * Every slot of a valid schedule, in time order. A dated event walks
 * wall-clock times in the reference zone: a time that does not exist on a date gives no
 * slot, and a time that occurs twice gives one slot at its first occurrence.
 */
export function scheduleSlots(schedule: Schedule): Slot[] {
	const { days, referenceZone } = schedule;

	if (days.mode === "weekdays") {
		return [...new Set(days.weekdays)]
			.toSorted((left, right) => left - right)
			.flatMap((weekday) =>
				[...dailyMinutes(schedule)].map((minute): Slot => ({ kind: "weekday", weekday, minute })),
			);
	}

	const slots: Slot[] = [];

	for (const date of eventDates(days)) {
		for (const minute of dailyMinutes(schedule)) {
			const wallClock = date.toPlainDateTime().add({ minutes: minute });
			const zoned = wallClock.toZonedDateTime(referenceZone, { disambiguation: "earlier" });

			// A wall-clock time inside a forward clock change resolves to a different time.
			if (zoned.toPlainDateTime().equals(wallClock)) {
				slots.push({ kind: "dated", start: zoned.toInstant() });
			}
		}
	}

	return slots;
}
