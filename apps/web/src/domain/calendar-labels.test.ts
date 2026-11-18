import { describe, expect, it } from "vitest";

import { localFirstDayOfWeek, timeLabel, weekdayNames } from "./calendar-labels";

describe("labels", () => {
	it("writes 24-hour time in Czech and British English, 12-hour in American English", () => {
		expect(timeLabel(18 * 60 + 30, "cs")).toBe("18:30");
		expect(timeLabel(18 * 60 + 30, "en-GB")).toBe("18:30");
		expect(timeLabel(18 * 60 + 30, "en-US")).toMatch(/^6:30\sPM$/u);
		expect(timeLabel(24 * 60, "cs")).toBe("0:00");
	});

	it("names days from Monday", () => {
		expect(weekdayNames("cs")[0]).toEqual({ short: "po", long: "pondělí" });
		expect(weekdayNames("en")[6]?.long).toBe("Sunday");
	});

	it("starts the week on Monday in Czechia and on Sunday in the United States", () => {
		expect(localFirstDayOfWeek("cs")).toBe(1);
		expect(localFirstDayOfWeek("en-US")).toBe(7);
	});
});
