import { describe, expect, it } from "vitest";

import { bestWindows, maximalWindows, mostPeople, type Window } from "./best-windows";
import { weekdayLayout } from "./grid-layout";

// Monday and Tuesday from 17:00 to 19:00 in 30-minute slots, as weekday keys.
const keys = ["w1-1020", "w1-1050", "w1-1080", "w1-1110", "w2-1020", "w2-1050"];
const layout = weekdayLayout(keys, 1);

describe("maximalWindows", () => {
	it("lists only windows that cannot grow without losing someone", () => {
		const participants = [
			{ available: ["w1-1020", "w1-1050", "w1-1080"] },
			{ available: ["w1-1050", "w1-1080", "w1-1110"] },
		];

		expect(maximalWindows(layout, 30, participants)).toEqual([
			{ column: 0, first: 0, last: 2, people: [0] },
			{ column: 0, first: 1, last: 2, people: [0, 1] },
			{ column: 0, first: 1, last: 3, people: [1] },
		]);
	});

	it("never crosses from one column to the next", () => {
		const participants = [{ available: ["w1-1110", "w2-1020"] }];

		expect(maximalWindows(layout, 30, participants)).toEqual([
			{ column: 0, first: 3, last: 3, people: [0] },
			{ column: 1, first: 0, last: 0, people: [0] },
		]);
	});

	it("breaks a window where rows do not follow directly", () => {
		const gap = weekdayLayout(["w1-600", "w1-660"], 1);
		const participants = [{ available: ["w1-600", "w1-660"] }];

		expect(maximalWindows(gap, 30, participants)).toHaveLength(2);
	});

	it("finds nothing without participants", () => {
		expect(maximalWindows(layout, 30, [])).toEqual([]);
	});
});

describe("bestWindows", () => {
	const windows: Window[] = [
		{ column: 1, first: 0, last: 0, people: [0, 1] },
		{ column: 0, first: 0, last: 3, people: [0] },
		{ column: 0, first: 2, last: 3, people: [0, 1] },
		{ column: 0, first: 0, last: 1, people: [0, 1] },
	];

	it("starts the people filter at the highest count", () => {
		expect(mostPeople(windows)).toBe(2);
		expect(mostPeople([])).toBe(0);
	});

	it("orders by people, then duration, then start", () => {
		expect(bestWindows(windows, { minSlots: 1, minPeople: 1 })).toEqual([
			windows[3],
			windows[2],
			windows[0],
			windows[1],
		]);
	});

	it("drops windows below either filter", () => {
		expect(bestWindows(windows, { minSlots: 2, minPeople: 2 })).toEqual([windows[3], windows[2]]);
		expect(bestWindows(windows, { minSlots: 5, minPeople: 1 })).toEqual([]);
	});

	it("shows at most five", () => {
		const many = Array.from({ length: 7 }, (_, row) => ({
			column: 0,
			first: row,
			last: row,
			people: [0],
		}));

		expect(bestWindows(many, { minSlots: 1, minPeople: 1 })).toHaveLength(5);
	});
});
