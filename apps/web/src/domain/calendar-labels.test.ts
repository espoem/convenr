import { describe, expect, it } from "vitest";

import { localFirstDayOfWeek, timeLabel, weekdayNames } from "./calendar-labels";

describe("labels", () => {
	it("writes 24-hour time in Czech and British English, 12-hour in American English", () => {
		expect(timeLabel(0, "cs")).toBe("0:00");
		expect(timeLabel(12 * 60, "en-US")).toMatch(/^12:00\sPM$/u);
		expect(timeLabel(18 * 60 + 30, "cs")).toBe("18:30");
		expect(timeLabel(18 * 60 + 30, "en-GB")).toBe("18:30");
		expect(timeLabel(18 * 60 + 30, "en-US")).toMatch(/^6:30\sPM$/u);
		expect(timeLabel(24 * 60, "cs")).toBe("0:00");
	});

	it("names all seven ISO weekdays in Monday-to-Sunday order for every locale", () => {
		const czech = weekdayNames("cs");
		const english = weekdayNames("en-US");

		expect(czech).toHaveLength(7);
		expect(english).toHaveLength(7);
		expect(czech[0]).toEqual({ short: "po", long: "pondělí" });
		expect(czech[6]).toEqual({ short: "ne", long: "neděle" });
		expect(english[0]).toEqual({ short: "Mon", long: "Monday" });
		expect(english[6]).toEqual({ short: "Sun", long: "Sunday" });
		expect(new Set(czech.map((day) => day.long)).size).toBe(7);
		expect(new Set(english.map((day) => day.short)).size).toBe(7);
	});

	it("starts the week on Monday in Czechia and Britain, and on Sunday in the United States", () => {
		expect(localFirstDayOfWeek("cs")).toBe(1);
		expect(localFirstDayOfWeek("en-GB")).toBe(1);
		expect(localFirstDayOfWeek("en-US")).toBe(7);
	});
});
