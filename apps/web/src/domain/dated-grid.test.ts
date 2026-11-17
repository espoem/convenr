import { describe, expect, it } from "vitest";

import { datedGrid } from "./dated-grid";
import { type DatedSlot, type Schedule, scheduleSlots, slotKey } from "./schedule";

function datedSlots(schedule: Schedule): DatedSlot[] {
	return scheduleSlots(schedule).filter((slot): slot is DatedSlot => slot.kind === "dated");
}

const twoEvenings = datedSlots({
	days: {
		mode: "range",
		first: Temporal.PlainDate.from("2027-04-05"),
		last: Temporal.PlainDate.from("2027-04-06"),
	},
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
});

describe("T1 dated event in the viewer's zone", () => {
	it("shows a Prague evening at midday for a viewer in New York", () => {
		const grid = datedGrid(twoEvenings, "America/New_York");

		expect(grid.columns.map(String)).toEqual(["2027-04-05", "2027-04-06"]);
		expect(grid.rows[0]).toBe(11 * 60);
		expect(grid.rows.at(-1)).toBe(14 * 60 + 30);
		expect(grid.cells.flat().every((cell) => cell.length === 1)).toBe(true);
	});

	it("moves the slots to the next local date for a viewer in Tokyo", () => {
		const grid = datedGrid(twoEvenings, "Asia/Tokyo");

		expect(grid.columns.map(String)).toEqual(["2027-04-06", "2027-04-07"]);
		expect(grid.rows).toEqual([0, 30, 60, 90, 120, 150, 180, 210]);
	});

	it("leaves a cell blank where a column has no slot at that time", () => {
		const uneven = [twoEvenings[0], twoEvenings.at(-1)].filter((slot) => slot !== undefined);
		const grid = datedGrid(uneven, "Europe/Prague");

		expect(grid.rows).toEqual([17 * 60, 20 * 60 + 30]);
		expect(grid.cells.map((column) => column.map((cell) => cell.length))).toEqual([
			[1, 0],
			[0, 1],
		]);
	});

	it("puts both slots in one cell when the viewer's clock shows the same time twice", () => {
		const repeated: DatedSlot[] = ["2027-11-07T05:30:00Z", "2027-11-07T06:30:00Z"].map((iso) => ({
			kind: "dated",
			start: Temporal.Instant.from(iso),
		}));

		const grid = datedGrid(repeated, "America/New_York");

		expect(grid.rows).toEqual([90]);
		expect(grid.cells[0]?.[0]?.map(slotKey)).toEqual([
			"2027-11-07T05:30:00Z",
			"2027-11-07T06:30:00Z",
		]);
	});
});
