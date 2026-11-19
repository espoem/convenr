import { describe, expect, it } from "vitest";

import { clearsFinal, type FinalTime, finalSlotKeys, finalWindow } from "./final-time";
import type { Schedule } from "./schedule";

const evenings: Omit<Schedule, "days"> = {
	dailyStart: 17 * 60,
	dailyEnd: 20 * 60,
	slotLength: 60,
	referenceZone: "Europe/Prague",
};

const dated: Schedule = {
	...evenings,
	days: {
		mode: "range",
		first: Temporal.PlainDate.from("2027-04-05"),
		last: Temporal.PlainDate.from("2027-04-06"),
	},
};

const weekly: Schedule = { ...evenings, days: { mode: "weekdays", weekdays: [1, 3] } };
const now = Temporal.Instant.from("2027-03-01T12:00:00Z");
const instant = (iso: string) => Temporal.Instant.from(iso);

describe("finalWindow", () => {
	it("takes a run of a dated event's slots, in any order, from its first start to its last end", () => {
		expect(
			finalWindow(dated, { slots: ["2027-04-05T16:00:00Z", "2027-04-05T15:00:00Z"] }, now),
		).toEqual({
			ok: true,
			start: instant("2027-04-05T15:00:00Z"),
			end: instant("2027-04-05T17:00:00Z"),
		});
	});

	it("refuses slots that are not one run of the event's slots", () => {
		const refused = { ok: false, problem: "final_not_in_event" };

		expect(finalWindow(dated, { slots: [] }, now)).toEqual(refused);
		expect(finalWindow(dated, { slots: ["2027-04-05T15:30:00Z"] }, now)).toEqual(refused);
		expect(
			finalWindow(dated, { slots: ["2027-04-05T15:00:00Z", "2027-04-05T17:00:00Z"] }, now),
		).toEqual(refused);
		// The evening of the 5th does not run on into the evening of the 6th.
		expect(
			finalWindow(dated, { slots: ["2027-04-05T17:00:00Z", "2027-04-06T15:00:00Z"] }, now),
		).toEqual(refused);
		expect(
			finalWindow(
				dated,
				{ slots: ["2027-04-05T15:00:00Z"], date: Temporal.PlainDate.from("2027-04-05") },
				now,
			),
		).toEqual(refused);
	});

	it("puts a weekday window on the chosen date in the reference zone", () => {
		expect(
			finalWindow(
				weekly,
				{ slots: ["w3-1080", "w3-1140"], date: Temporal.PlainDate.from("2027-04-07") },
				now,
			),
		).toEqual({
			ok: true,
			start: instant("2027-04-07T16:00:00Z"),
			end: instant("2027-04-07T18:00:00Z"),
		});
	});

	it("needs a weekday window's date on its weekday, from today on", () => {
		expect(finalWindow(weekly, { slots: ["w3-1080"] }, now)).toEqual({
			ok: false,
			problem: "final_not_in_event",
		});
		expect(
			finalWindow(weekly, { slots: ["w3-1080"], date: Temporal.PlainDate.from("2027-04-06") }, now),
		).toEqual({ ok: false, problem: "final_date_wrong_weekday" });
		expect(
			finalWindow(weekly, { slots: ["w1-1080"], date: Temporal.PlainDate.from("2027-02-22") }, now),
		).toEqual({ ok: false, problem: "date_in_past" });
		expect(
			finalWindow(
				weekly,
				{ slots: ["w1-1080", "w3-1080"], date: Temporal.PlainDate.from("2027-04-05") },
				now,
			),
		).toEqual({ ok: false, problem: "final_not_in_event" });
	});
});

describe("the final time's slots", () => {
	const datedFinal: FinalTime = {
		kind: "chosen",
		start: instant("2027-04-05T15:00:00Z"),
		end: instant("2027-04-05T17:00:00Z"),
		sequence: 1,
	};

	const weeklyFinal: FinalTime = {
		kind: "chosen",
		start: instant("2027-04-07T16:00:00Z"),
		end: instant("2027-04-07T17:00:00Z"),
		sequence: 1,
	};

	it("are the slots inside it, a weekday slot by its occurrence on the final date", () => {
		expect(finalSlotKeys(datedFinal, dated)).toEqual([
			"2027-04-05T15:00:00Z",
			"2027-04-05T16:00:00Z",
		]);
		expect(finalSlotKeys(weeklyFinal, weekly)).toEqual(["w3-1080"]);
		expect(finalSlotKeys({ kind: "open", sequence: 2 }, weekly)).toEqual([]);
	});

	it("are cleared by a change that removes one of them, and by no other", () => {
		expect(clearsFinal(weeklyFinal, weekly, [{ kind: "weekday", weekday: 3, minute: 1080 }])).toBe(
			true,
		);
		expect(clearsFinal(weeklyFinal, weekly, [{ kind: "weekday", weekday: 1, minute: 1080 }])).toBe(
			false,
		);
		expect(
			clearsFinal(datedFinal, dated, [{ kind: "dated", start: instant("2027-04-05T17:00:00Z") }]),
		).toBe(false);
	});
});
