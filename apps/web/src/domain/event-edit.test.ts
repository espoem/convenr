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
	it("keeps past dates the event already had and refuses added past dates", () => {
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
		expect(editProblems(before, backdated, true, now)).toEqual([
			{ code: "date_in_past", path: ["days", "dates", 0] },
		]);
	});

	it("locks slot length, day mode and zone once someone joined, at the changed field", () => {
		const changes: [Schedule, string[]][] = [
			[{ ...before, slotLength: 30 }, ["slotLength"]],
			[{ ...before, referenceZone: "Europe/London" }, ["referenceZone"]],
			[
				{ ...before, days: { mode: "range", first: date("2027-04-06"), last: date("2027-04-07") } },
				["days", "mode"],
			],
		];

		for (const [after, path] of changes) {
			const locked = { code: "field_locked", path };

			expect(editProblems(before, after, true, now)).toContainEqual(locked);
			expect(editProblems(before, after, false, now)).not.toContainEqual(locked);
		}
	});

	it("still applies the time range limits to the new times", () => {
		expect(editProblems(before, { ...before, dailyEnd: 16 * 60 }, true, now)).toEqual([
			{ code: "end_not_after_start", path: ["dailyEnd"] },
		]);
	});
});

describe("removedSlots", () => {
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
