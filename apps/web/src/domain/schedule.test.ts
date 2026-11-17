import { describe, expect, it } from "vitest";

import { type Schedule, scheduleSlots, slotKey, validateSchedule } from "./schedule";

const date = (iso: string) => Temporal.PlainDate.from(iso);
const instant = (iso: string) => Temporal.Instant.from(iso);
const keys = (schedule: Schedule) => scheduleSlots(schedule).map(slotKey);

const evening: Schedule = {
	days: { mode: "range", first: date("2027-04-05"), last: date("2027-04-09") },
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
};

const now = instant("2027-03-01T12:00:00Z");

function mayFrom(last: string): Schedule {
	return { ...evening, days: { mode: "range", first: date("2027-05-01"), last: date(last) } };
}

function onDates(...isos: string[]): Schedule {
	return { ...evening, days: { mode: "dates", dates: isos.map(date) } };
}

function onDateIn(iso: string, referenceZone: string): Schedule {
	return { ...evening, referenceZone, days: { mode: "dates", dates: [date(iso)] } };
}

describe("E2 days", () => {
	it("accepts a range of 31 dates and refuses 32", () => {
		expect(validateSchedule(mayFrom("2027-05-31"), now)).toEqual([]);
		expect(validateSchedule(mayFrom("2027-06-01"), now)).toEqual(["E2.too-many-dates"]);
	});

	it("refuses a range whose last date is before its first", () => {
		const reversed: Schedule = {
			...evening,
			days: { mode: "range", first: date("2027-04-09"), last: date("2027-04-05") },
		};

		expect(validateSchedule(reversed, now)).toEqual(["E2.range-reversed"]);
	});

	it("refuses no dates and duplicate dates", () => {
		expect(validateSchedule(onDates(), now)).toEqual(["E2.no-days"]);
		expect(validateSchedule(onDates("2027-04-05", "2027-04-05"), now)).toEqual([
			"E2.duplicate-day",
		]);
		expect(validateSchedule(onDates("2027-04-05", "2027-05-20"), now)).toEqual([]);
	});

	it("refuses no weekdays and duplicate weekdays", () => {
		expect(validateSchedule({ ...evening, days: { mode: "weekdays", weekdays: [] } }, now)).toEqual(
			["E2.no-days"],
		);
		expect(
			validateSchedule({ ...evening, days: { mode: "weekdays", weekdays: [2, 2] } }, now),
		).toEqual(["E2.duplicate-day"]);
	});

	it("refuses a date before today in the reference zone, and accepts today", () => {
		const lateEvening = instant("2027-03-01T23:30:00Z");

		expect(validateSchedule(onDateIn("2027-03-01", "Europe/Prague"), now)).toEqual([]);
		expect(validateSchedule(onDateIn("2027-02-28", "Europe/Prague"), now)).toEqual([
			"E2.date-in-past",
		]);
		// At 23:30 UTC it is already 2 March in Auckland.
		expect(validateSchedule(onDateIn("2027-03-01", "Pacific/Auckland"), lateEvening)).toEqual([
			"E2.date-in-past",
		]);
	});
});

describe("E3 daily time range", () => {
	it("accepts the whole day", () => {
		expect(validateSchedule({ ...evening, dailyStart: 0, dailyEnd: 24 * 60 }, now)).toEqual([]);
	});

	it("refuses a range outside one day, a range that does not end after it starts, and odd times", () => {
		expect(validateSchedule({ ...evening, dailyEnd: 24 * 60 + 30 }, now)).toEqual([
			"E3.out-of-day",
		]);
		expect(validateSchedule({ ...evening, dailyEnd: evening.dailyStart }, now)).toEqual([
			"E3.end-not-after-start",
		]);
		expect(validateSchedule({ ...evening, dailyStart: 17 * 60 + 10 }, now)).toEqual([
			"E3.not-on-slot-boundary",
		]);
	});
});

describe("E4 slots of a dated event", () => {
	it("walks the wall clock in the reference zone and identifies slots by UTC instant", () => {
		const oneDay: Schedule = {
			...evening,
			days: { mode: "dates", dates: [date("2027-04-05")] },
			dailyEnd: 18 * 60,
		};

		expect(keys(oneDay)).toEqual(["2027-04-05T15:00:00Z", "2027-04-05T15:30:00Z"]);
	});

	it("makes no slot for wall-clock times skipped when Prague moves forward on 28 March 2027", () => {
		const springForward: Schedule = {
			...evening,
			days: { mode: "dates", dates: [date("2027-03-28")] },
			dailyStart: 60,
			dailyEnd: 4 * 60,
		};

		// 02:00 and 02:30 do not exist; 01:00 is CET (UTC+1), 03:00 is CEST (UTC+2).
		expect(keys(springForward)).toEqual([
			"2027-03-28T00:00:00Z",
			"2027-03-28T00:30:00Z",
			"2027-03-28T01:00:00Z",
			"2027-03-28T01:30:00Z",
		]);
	});

	it("makes one slot at the first occurrence of times repeated when Prague moves back on 31 October 2027", () => {
		const fallBack: Schedule = {
			...evening,
			days: { mode: "dates", dates: [date("2027-10-31")] },
			dailyStart: 60,
			dailyEnd: 4 * 60,
		};

		// 02:00 and 02:30 occur twice; only the first, in CEST (UTC+2), is a slot.
		expect(keys(fallBack)).toEqual([
			"2027-10-30T23:00:00Z",
			"2027-10-30T23:30:00Z",
			"2027-10-31T00:00:00Z",
			"2027-10-31T00:30:00Z",
			"2027-10-31T02:00:00Z",
			"2027-10-31T02:30:00Z",
		]);
	});

	it("orders specific dates and ignores the order they were given in", () => {
		const outOfOrder: Schedule = {
			...evening,
			days: { mode: "dates", dates: [date("2027-04-07"), date("2027-04-05")] },
			dailyEnd: 17 * 60 + 30,
		};

		expect(keys(outOfOrder)).toEqual(["2027-04-05T15:00:00Z", "2027-04-07T15:00:00Z"]);
	});
});

describe("E5 slots of a weekday event", () => {
	it("identifies slots by day of week and minute, sorted by ISO day, never converted", () => {
		const weekly: Schedule = {
			...evening,
			referenceZone: "America/New_York",
			days: { mode: "weekdays", weekdays: [3, 1] },
			dailyStart: 18 * 60,
			dailyEnd: 19 * 60,
		};

		expect(keys(weekly)).toEqual(["w1-1080", "w1-1110", "w3-1080", "w3-1110"]);
	});
});
