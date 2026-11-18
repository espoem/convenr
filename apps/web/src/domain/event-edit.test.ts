import { describe, expect, it } from "vitest";

import { editProblems, removedSlots } from "./event-edit";
import { type Schedule, slotKey } from "./schedule";

const date = (iso: string) => Temporal.PlainDate.from(iso);

const beforeDates = [date("2027-04-05"), date("2027-04-06")];

const before: Schedule = {
	days: { mode: "dates", dates: beforeDates },
	dailyStart: 17 * 60,
	dailyEnd: 19 * 60,
	slotLength: 60,
	referenceZone: "Europe/Prague",
};

// The first date has passed; the second is today in Prague.
const now = Temporal.Instant.from("2027-04-06T08:00:00Z");

describe("editProblems", () => {
	it("keeps past dates the event already had and refuses added past dates (M4)", () => {
		const extended: Schedule = {
			...before,
			days: {
				mode: "dates",
				dates: [...beforeDates, date("2027-04-07")],
			},
		};

		const backdated: Schedule = {
			...before,
			days: { mode: "dates", dates: [date("2027-04-04"), date("2027-04-06")] },
		};

		expect(editProblems(before, extended, true, now)).toEqual([]);
		expect(editProblems(before, backdated, true, now)).toEqual(["date_in_past"]);
	});

	it("locks slot length, day mode and zone once someone joined (M3)", () => {
		const changes: Schedule[] = [
			{ ...before, slotLength: 30 },
			{ ...before, referenceZone: "Europe/London" },
			{ ...before, days: { mode: "range", first: date("2027-04-06"), last: date("2027-04-07") } },
		];

		for (const after of changes) {
			expect(editProblems(before, after, true, now)).toContain("field_locked");
			expect(editProblems(before, after, false, now)).not.toContain("field_locked");
		}
	});

	it("still applies the limits of E3 to the new times (M2)", () => {
		expect(editProblems(before, { ...before, dailyEnd: 16 * 60 }, true, now)).toEqual([
			"end_not_after_start",
		]);
	});
});

describe("removedSlots (M5)", () => {
	it("lists the slots a narrower time range drops", () => {
		const removed = removedSlots(before, { ...before, dailyEnd: 18 * 60 });

		// 18:00 in Prague is 16:00 UTC in April.
		expect(removed.map((slot) => slotKey(slot))).toEqual([
			"2027-04-05T16:00:00Z",
			"2027-04-06T16:00:00Z",
		]);
	});

	it("lists nothing when the change only extends", () => {
		expect(removedSlots(before, { ...before, dailyStart: 16 * 60 })).toEqual([]);
	});

	it("lists the slots of a removed weekday", () => {
		const weekly: Schedule = { ...before, days: { mode: "weekdays", weekdays: [1, 3] } };
		const removed = removedSlots(weekly, { ...weekly, days: { mode: "weekdays", weekdays: [1] } });

		expect(removed.map((slot) => slotKey(slot))).toEqual(["w3-1020", "w3-1080"]);
	});
});
