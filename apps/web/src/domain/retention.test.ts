import { describe, expect, it } from "vitest";

import { deletionDate } from "./retention";
import type { Schedule } from "./schedule";

const evenings: Omit<Schedule, "days"> = {
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
};

const date = (iso: string) => Temporal.PlainDate.from(iso);

describe("E7 planned deletion date", () => {
	it("is 90 days after the last date of a dated event, whenever it last changed", () => {
		const schedule: Schedule = {
			...evenings,
			days: { mode: "dates", dates: [date("2027-04-20"), date("2027-04-05")] },
		};

		const change = Temporal.Instant.from("2027-04-01T10:00:00Z");

		expect(deletionDate(schedule, change, 90).toString()).toBe("2027-07-19");
	});

	it("is 90 days after the last change of a weekday event, as a date in the reference zone", () => {
		const schedule: Schedule = { ...evenings, days: { mode: "weekdays", weekdays: [1] } };
		// 23:30 UTC on 31 March is already 1 April in Prague.
		const change = Temporal.Instant.from("2027-03-31T23:30:00Z");

		expect(deletionDate(schedule, change, 90).toString()).toBe("2027-06-30");
	});
});
