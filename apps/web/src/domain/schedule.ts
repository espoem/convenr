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

/** An event's grid: days, a daily range and a slot length. */
export type GridSchedule = {
	kind: "grid";
	days: EventDays;
	/** Minutes after midnight in the reference zone, inclusive. */
	dailyStart: number;
	/** Minutes after midnight in the reference zone, exclusive. At most 1440. */
	dailyEnd: number;
	slotLength: SlotLength;
	/** IANA zone name. */
	referenceZone: string;
	/** The day the grid's weeks start on. */
	firstDayOfWeek: Weekday;
};

/** A time a poll offers: a start and an end on one date in the reference zone. */
export type PollOption = { id: string; start: Temporal.Instant; end: Temporal.Instant };

/** An event's poll: a few hand-picked times. */
export type PollSchedule = {
	kind: "poll";
	/** In time order as stored; in the order of the request while a change is checked. */
	options: PollOption[];
	/** IANA zone name. */
	referenceZone: string;
};

export type Schedule = GridSchedule | PollSchedule;

export type ScheduleProblem =
	| "no_days"
	| "range_reversed"
	| "too_many_dates"
	| "duplicate_day"
	| "date_in_past"
	| "out_of_day"
	| "end_not_after_start"
	| "not_on_slot_boundary";

/**
 * A broken rule and the field it concerns, as a path into the schedule such as
 * `["days", "dates", 2]`, so that a client can point at the field.
 */
export type ScheduleIssue<Code extends string = ScheduleProblem> = {
	code: Code;
	path: (string | number)[];
};

export type DatedSlot = { kind: "dated"; start: Temporal.Instant };

export type WeekdaySlot = { kind: "weekday"; weekday: Weekday; minute: number };

/** A poll option, answered as a slot is. */
export type OptionSlot = { kind: "option"; option: string };

export type GridSlot = DatedSlot | WeekdaySlot;

export type Slot = GridSlot | OptionSlot;

/** The stored identity of a slot, as a string that sets and maps can compare. */
export function slotKey(slot: Slot): string {
	switch (slot.kind) {
		case "dated":
			return slot.start.toString();
		case "weekday":
			return `w${slot.weekday}-${slot.minute}`;
		case "option":
			return `o-${slot.option}`;
	}
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

/** Indexes of the values that repeat an earlier one. */
function repeats(values: readonly (string | number)[]): number[] {
	return values.flatMap((value, index) => (values.indexOf(value) < index ? [index] : []));
}

function dayIssues(
	days: EventDays,
	today: Temporal.PlainDate,
	keptDates: ReadonlySet<string>,
): ScheduleIssue[] {
	if (days.mode === "weekdays") {
		if (days.weekdays.length === 0) {
			return [{ code: "no_days", path: ["days", "weekdays"] }];
		}

		return repeats(days.weekdays).map((index) => ({
			code: "duplicate_day",
			path: ["days", "weekdays", index],
		}));
	}

	const issues: ScheduleIssue[] = [];

	if (days.mode === "range" && Temporal.PlainDate.compare(days.first, days.last) > 0) {
		return [{ code: "range_reversed", path: ["days", "last"] }];
	}

	if (days.mode === "dates") {
		if (days.dates.length === 0) {
			return [{ code: "no_days", path: ["days", "dates"] }];
		}

		for (const index of repeats(days.dates.map(String))) {
			issues.push({ code: "duplicate_day", path: ["days", "dates", index] });
		}
	}

	if (eventDates(days).length > MAX_DATES) {
		issues.push({
			code: "too_many_dates",
			path: days.mode === "range" ? ["days", "last"] : ["days", "dates"],
		});
	}

	const past = (date: Temporal.PlainDate) =>
		Temporal.PlainDate.compare(date, today) < 0 && !keptDates.has(date.toString());

	if (days.mode === "range") {
		// A range starts at its earliest date, so a past date in it is a problem of the first.
		if (eventDates(days).some((date) => past(date))) {
			issues.push({ code: "date_in_past", path: ["days", "first"] });
		}
	} else {
		for (const [index, date] of days.dates.entries()) {
			if (past(date)) {
				issues.push({ code: "date_in_past", path: ["days", "dates", index] });
			}
		}
	}

	return issues;
}

function timeIssues(schedule: GridSchedule): ScheduleIssue[] {
	const { dailyStart, dailyEnd, slotLength } = schedule;

	const outside: ScheduleIssue[] = [];

	if (dailyStart < 0) {
		outside.push({ code: "out_of_day", path: ["dailyStart"] });
	}

	if (dailyEnd > MINUTES_PER_DAY) {
		outside.push({ code: "out_of_day", path: ["dailyEnd"] });
	}

	if (outside.length > 0) {
		return outside;
	}

	if (dailyEnd <= dailyStart) {
		return [{ code: "end_not_after_start", path: ["dailyEnd"] }];
	}

	return (["dailyStart", "dailyEnd"] as const).flatMap((field): ScheduleIssue[] =>
		schedule[field] % slotLength === 0 ? [] : [{ code: "not_on_slot_boundary", path: [field] }],
	);
}

/**
 * Problems that make a schedule invalid, each at the field it concerns. `now` is the moment of
 * the change; a date before today in the reference zone is refused unless it is one of
 * `keptDates`, the dates an edited event already had.
 */
export function validateSchedule(
	schedule: GridSchedule,
	now: Temporal.Instant,
	keptDates: ReadonlySet<string> = new Set(),
): ScheduleIssue[] {
	const today = now.toZonedDateTimeISO(schedule.referenceZone).toPlainDate();

	return [...dayIssues(schedule.days, today, keptDates), ...timeIssues(schedule)];
}

/** The dates of a dated schedule as ISO strings; none for a weekday schedule. */
export function scheduleDates(schedule: GridSchedule): Set<string> {
	const { days } = schedule;

	return new Set(days.mode === "weekdays" ? [] : eventDates(days).map(String));
}

function* dailyMinutes(schedule: GridSchedule): Generator<number> {
	for (
		let minute = schedule.dailyStart;
		minute < schedule.dailyEnd;
		minute += schedule.slotLength
	) {
		yield minute;
	}
}

/** Every slot of a valid schedule, in time order: a poll's options or a grid's slots. */
export function scheduleSlots(schedule: Schedule): Slot[] {
	if (schedule.kind === "poll") {
		return schedule.options.map((option) => ({ kind: "option", option: option.id }));
	}

	return gridSlots(schedule);
}

/**
 * Every slot of a valid grid, in time order. A dated event walks wall-clock times in the
 * reference zone: a time that does not exist on a date gives no slot, and a time that occurs
 * twice gives one slot at its first occurrence.
 */
export function gridSlots(schedule: GridSchedule): GridSlot[] {
	const { days, referenceZone } = schedule;

	if (days.mode === "weekdays") {
		return [...new Set(days.weekdays)]
			.toSorted((left, right) => left - right)
			.flatMap((weekday) =>
				[...dailyMinutes(schedule)].map((minute): GridSlot => ({
					kind: "weekday",
					weekday,
					minute,
				})),
			);
	}

	const slots: GridSlot[] = [];

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
