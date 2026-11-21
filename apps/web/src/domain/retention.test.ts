import { describe, expect, it } from "vitest";

import type { FinalTime } from "./final-time";
import { type Deletion, deletionOf, expiresAt, type Keeping } from "./retention";
import type { GridSchedule } from "./schedule";

const evenings: Omit<GridSchedule, "days"> = {
	kind: "grid",
	firstDayOfWeek: 1,
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
};

const date = (iso: string) => Temporal.PlainDate.from(iso);
const open: FinalTime = { kind: "open", sequence: 0 };
const notKept: Keeping = { kind: "not_kept" };

/** A final time from 17:00 to 18:00 UTC on `day`. */
function chosen(day: string): FinalTime {
	return {
		kind: "chosen",
		start: Temporal.Instant.from(`${day}T17:00:00Z`),
		end: Temporal.Instant.from(`${day}T18:00:00Z`),
		sequence: 1,
	};
}

function on(day: string): Deletion {
	return { kind: "on", date: date(day) };
}

describe("planned deletion date", () => {
	it("is 90 days after the last date of a dated event, whenever it last changed", () => {
		const schedule: GridSchedule = {
			...evenings,
			days: { mode: "dates", dates: [date("2027-04-20"), date("2027-04-05")] },
		};

		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionOf(schedule, change, 90, open, notKept)).toEqual(on("2027-07-19"));
	});

	it("is 90 days after the last change of a weekday event, as a date in the reference zone", () => {
		const schedule: GridSchedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		// 23:30 UTC on 31 March is already 1 April in Prague.
		const change = Temporal.Instant.from("2027-03-31T23:30:00Z");

		expect(deletionOf(schedule, change, 90, open, notKept)).toEqual(on("2027-06-30"));
	});

	it("keeps a weekday event until the retention after a final date that lies beyond it", () => {
		const schedule: GridSchedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionOf(schedule, change, 30, chosen("2027-05-10"), notKept)).toEqual(
			on("2027-06-09"),
		);
		expect(deletionOf(schedule, change, 30, chosen("2027-04-26"), notKept)).toEqual(
			on("2027-05-01"),
		);
	});

	it("follows the current setting, and the instance keeps every event with never", () => {
		const schedule: GridSchedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionOf(schedule, change, 30, open, notKept)).toEqual(on("2027-05-01"));
		expect(deletionOf(schedule, change, "never", open, { kind: "kept" })).toEqual({
			kind: "kept",
			by: "instance",
		});
	});
});

describe("keeping by the owner", () => {
	const schedule: GridSchedule = {
		...evenings,
		days: { mode: "dates", dates: [date("2027-04-20")] },
	};

	const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

	it("has no deletion date while it lasts", () => {
		expect(deletionOf(schedule, change, 90, open, { kind: "kept" })).toEqual({
			kind: "kept",
			by: "organizer",
		});
	});

	it("gives a full retention period from the day it ends, in the reference zone", () => {
		// 23:30 UTC on 1 December is already 2 December in Prague.
		const ended: Keeping = { kind: "ended", at: Temporal.Instant.from("2027-12-01T23:30:00Z") };

		expect(deletionOf(schedule, change, 90, open, ended)).toEqual(on("2028-03-01"));
	});

	it("leaves a later planned date as it is", () => {
		const ended: Keeping = { kind: "ended", at: Temporal.Instant.from("2027-04-02T10:00:00Z") };

		expect(deletionOf(schedule, change, 90, open, ended)).toEqual(on("2027-07-19"));
	});
});

describe("expiry", () => {
	it("comes at the end of the deletion date in the reference zone", () => {
		// Midnight after 19 July in Prague (summer time) is 22:00 UTC.
		expect(expiresAt(on("2027-07-19"), "Europe/Prague")?.toString()).toBe("2027-07-19T22:00:00Z");
		expect(expiresAt({ kind: "kept", by: "organizer" }, "Europe/Prague")).toBeNull();
	});
});
