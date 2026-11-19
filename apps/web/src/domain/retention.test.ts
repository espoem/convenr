import { describe, expect, it } from "vitest";

import type { FinalTime } from "./final-time";
import { deletionDate, expiresAt } from "./retention";
import type { Schedule } from "./schedule";

const evenings: Omit<Schedule, "days"> = {
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
};

const date = (iso: string) => Temporal.PlainDate.from(iso);
const open: FinalTime = { kind: "open", sequence: 0 };

/** A final time from 17:00 to 18:00 UTC on `day`. */
function chosen(day: string): FinalTime {
	return {
		kind: "chosen",
		start: Temporal.Instant.from(`${day}T17:00:00Z`),
		end: Temporal.Instant.from(`${day}T18:00:00Z`),
		sequence: 1,
	};
}

describe("planned deletion date", () => {
	it("is 90 days after the last date of a dated event, whenever it last changed", () => {
		const schedule: Schedule = {
			...evenings,
			days: { mode: "dates", dates: [date("2027-04-20"), date("2027-04-05")] },
		};

		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionDate(schedule, change, 90, open)?.toString()).toBe("2027-07-19");
	});

	it("is 90 days after the last change of a weekday event, as a date in the reference zone", () => {
		const schedule: Schedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		// 23:30 UTC on 31 March is already 1 April in Prague.
		const change = Temporal.Instant.from("2027-03-31T23:30:00Z");

		expect(deletionDate(schedule, change, 90, open)?.toString()).toBe("2027-06-30");
	});

	it("keeps a weekday event until the retention after a final date that lies beyond it", () => {
		const schedule: Schedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionDate(schedule, change, 30, chosen("2027-05-10"))?.toString()).toBe("2027-06-09");
		expect(deletionDate(schedule, change, 30, chosen("2027-04-26"))?.toString()).toBe("2027-05-01");
	});

	it("follows the current setting and is absent with never", () => {
		const schedule: Schedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionDate(schedule, change, 30, open)?.toString()).toBe("2027-05-01");
		expect(deletionDate(schedule, change, "never", open)).toBeNull();
	});
});

describe("expiry", () => {
	it("comes at the end of the deletion date in the reference zone", () => {
		const schedule: Schedule = {
			...evenings,
			days: { mode: "dates", dates: [date("2027-04-20")] },
		};

		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		// The deletion date is 19 July; midnight after it in Prague (summer time) is 22:00 UTC.
		expect(expiresAt(schedule, change, 90, open)?.toString()).toBe("2027-07-19T22:00:00Z");
		expect(expiresAt(schedule, change, "never", open)).toBeNull();
	});
});
