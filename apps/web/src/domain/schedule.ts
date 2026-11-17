// Days, daily time range and slots of an event: spec rules E2 to E5 and ADR 0002.

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

/** The seven days of the week in display order for a week starting on `first` (T4). */
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
	| "E2.no-days"
	| "E2.range-reversed"
	| "E2.too-many-dates"
	| "E2.duplicate-day"
	| "E2.date-in-past"
	| "E3.out-of-day"
	| "E3.end-not-after-start"
	| "E3.not-on-slot-boundary";

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

		return [...unique.values()].toSorted(Temporal.PlainDate.compare);
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

function dayProblems(days: EventDays, today: Temporal.PlainDate): ScheduleProblem[] {
	if (days.mode === "weekdays") {
		if (days.weekdays.length === 0) {
			return ["E2.no-days"];
		}

		return new Set(days.weekdays).size === days.weekdays.length ? [] : ["E2.duplicate-day"];
	}

	const problems: ScheduleProblem[] = [];

	if (days.mode === "range" && Temporal.PlainDate.compare(days.first, days.last) > 0) {
		return ["E2.range-reversed"];
	}

	if (days.mode === "dates") {
		if (days.dates.length === 0) {
			return ["E2.no-days"];
		}

		if (new Set(days.dates.map(String)).size !== days.dates.length) {
			problems.push("E2.duplicate-day");
		}
	}

	const dates = eventDates(days);

	if (dates.length > MAX_DATES) {
		problems.push("E2.too-many-dates");
	}

	if (dates.some((date) => Temporal.PlainDate.compare(date, today) < 0)) {
		problems.push("E2.date-in-past");
	}

	return problems;
}

function timeProblems(schedule: Schedule): ScheduleProblem[] {
	const { dailyStart, dailyEnd, slotLength } = schedule;

	if (dailyStart < 0 || dailyEnd > MINUTES_PER_DAY) {
		return ["E3.out-of-day"];
	}

	if (dailyEnd <= dailyStart) {
		return ["E3.end-not-after-start"];
	}

	return dailyStart % slotLength === 0 && dailyEnd % slotLength === 0
		? []
		: ["E3.not-on-slot-boundary"];
}

/**
 * Problems that make a schedule invalid by rules E2 and E3. `now` is the moment of
 * creation; a date before today in the reference zone is refused.
 */
export function validateSchedule(schedule: Schedule, now: Temporal.Instant): ScheduleProblem[] {
	const today = now.toZonedDateTimeISO(schedule.referenceZone).toPlainDate();

	return [...dayProblems(schedule.days, today), ...timeProblems(schedule)];
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
 * Every slot of a valid schedule by rules E4 and E5, in time order. A dated event walks
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
