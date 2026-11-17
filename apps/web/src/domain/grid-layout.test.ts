import { describe, expect, it } from "vitest";

import { closesHour, datedLayout, weekdayLayout } from "./grid-layout";
import { scheduleSlots, slotKey } from "./schedule";

const date = (iso: string) => Temporal.PlainDate.from(iso);

describe("T4 week blocks", () => {
	it("splits a dated event into one block per calendar week starting on Monday", () => {
		const keys = scheduleSlots({
			days: {
				mode: "dates",
				dates: ["2027-06-10", "2027-06-11", "2027-06-14", "2027-06-15"].map((iso) => date(iso)),
			},
			dailyStart: 17 * 60,
			dailyEnd: 18 * 60,
			slotLength: 30,
			referenceZone: "Europe/Prague",
		}).map((slot) => slotKey(slot));

		const layout = datedLayout(keys, "Europe/Prague", 1);

		expect(
			layout.blocks.map((block) => block.map((column) => column.kind === "date" && column.date)),
		).toEqual([
			["2027-06-10", "2027-06-11"],
			["2027-06-14", "2027-06-15"],
		]);
		expect(layout.rows).toEqual([17 * 60, 17 * 60 + 30]);
		expect(layout.blocks[0]?.[0]?.cells).toEqual([
			["2027-06-10T15:00:00Z"],
			["2027-06-10T15:30:00Z"],
		]);
	});

	it("starts the week on Sunday when the event says so", () => {
		const keys = ["2027-06-12T15:00:00Z", "2027-06-13T15:00:00Z", "2027-06-14T15:00:00Z"];

		const layout = datedLayout(keys, "Europe/Prague", 7);

		// Saturday ends one week; Sunday and Monday start the next.
		expect(layout.blocks.map((block) => block.length)).toEqual([1, 2]);
	});
});

describe("T3 weekday events", () => {
	it("orders columns from the first day of week and keeps times as stored", () => {
		const layout = weekdayLayout(["w1-1080", "w7-1080", "w1-1110", "w7-1110"], 7);

		expect(layout.blocks).toEqual([
			[
				{ kind: "weekday", weekday: 7, cells: [["w7-1080"], ["w7-1110"]] },
				{ kind: "weekday", weekday: 1, cells: [["w1-1080"], ["w1-1110"]] },
			],
		]);
		expect(layout.rows).toEqual([1080, 1110]);
	});
});

describe("DESIGN.md rule 3 lines", () => {
	it("closes a row with a solid line before a new hour, at a gap and after the last row", () => {
		const rows = [17 * 60, 17 * 60 + 30, 18 * 60, 20 * 60];

		expect(rows.map((_, index) => closesHour(rows, index, 30))).toEqual([false, true, true, true]);
	});
});
