import { describe, expect, it } from "vitest";

import { bestWindows, maximalWindows, mostPeople, type Window, windowTally } from "./best-windows";
import { type GridLayout, weekdayLayout } from "./grid-layout";
import type { Level, Levels } from "./levels";

// Monday and Tuesday from 17:00 to 19:00 in 30-minute slots, as weekday keys.
const keys = ["w1-1020", "w1-1050", "w1-1080", "w1-1110", "w2-1020", "w2-1050"];
const layout = weekdayLayout(keys, 1);

function available(...slots: string[]) {
	const levels: Levels = Object.fromEntries(slots.map((slot) => [slot, "available" as const]));

	return { levels };
}

const at = (person: number, level: Level = "available") => ({ person, level });

describe("maximalWindows", () => {
	it("lists only windows that cannot grow without losing someone", () => {
		const participants = [
			available("w1-1020", "w1-1050", "w1-1080"),
			available("w1-1050", "w1-1080", "w1-1110"),
		];

		expect(maximalWindows(layout, 30, participants)).toEqual([
			{ column: 0, first: 0, last: 2, people: [at(0)] },
			{ column: 0, first: 1, last: 2, people: [at(0), at(1)] },
			{ column: 0, first: 1, last: 3, people: [at(1)] },
		]);
	});

	it("counts heads for maximality and marks a person at if need be in any slot", () => {
		const participants = [
			{ levels: { "w1-1020": "available", "w1-1050": "if_need_be" } as const },
			available("w1-1020", "w1-1050"),
		];

		expect(maximalWindows(layout, 30, participants)).toEqual([
			{ column: 0, first: 0, last: 1, people: [at(0, "if_need_be"), at(1)] },
		]);
	});

	it("never crosses from one column to the next", () => {
		const participants = [available("w1-1110", "w2-1020")];

		expect(maximalWindows(layout, 30, participants)).toEqual([
			{ column: 0, first: 3, last: 3, people: [at(0)] },
			{ column: 1, first: 0, last: 0, people: [at(0)] },
		]);
	});

	it("breaks a window where rows do not follow directly", () => {
		const gap = weekdayLayout(["w1-600", "w1-660"], 1);

		expect(maximalWindows(gap, 30, [available("w1-600", "w1-660")])).toHaveLength(2);
	});

	it("breaks a window where adjacent rows skip an instant across a clock jump", () => {
		const jumped: GridLayout = {
			rows: [60, 120],
			blocks: [
				[
					{
						kind: "date",
						date: "2027-03-28",
						cells: [["2027-03-28T00:00:00Z"], ["2027-03-28T02:00:00Z"]],
					},
				],
			],
		};

		expect(
			maximalWindows(jumped, 60, [available("2027-03-28T00:00:00Z", "2027-03-28T02:00:00Z")]),
		).toEqual([
			{ column: 0, first: 0, last: 0, people: [at(0)] },
			{ column: 0, first: 1, last: 1, people: [at(0)] },
		]);
	});

	it("finds nothing without participants", () => {
		expect(maximalWindows(layout, 30, [])).toEqual([]);
	});
});

describe("bestWindows", () => {
	const windows: Window[] = [
		{ column: 1, first: 0, last: 0, people: [at(0), at(1)] },
		{ column: 0, first: 0, last: 3, people: [at(0)] },
		{ column: 0, first: 2, last: 3, people: [at(0), at(1)] },
		{ column: 0, first: 0, last: 1, people: [at(0), at(1)] },
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

	it("orders by score before heads", () => {
		const scored: Window[] = [
			{ column: 0, first: 0, last: 0, people: [at(0, "if_need_be"), at(1, "if_need_be"), at(2)] },
			{ column: 1, first: 0, last: 0, people: [at(0), at(1)] },
			{ column: 0, first: 1, last: 1, people: [at(0), at(1, "if_need_be"), at(2)] },
		];

		expect(scored.map((window) => windowTally(window))).toEqual([
			{ available: 1, ifNeedBe: 2 },
			{ available: 2, ifNeedBe: 0 },
			{ available: 2, ifNeedBe: 1 },
		]);
		expect(bestWindows(scored, { minSlots: 1, minPeople: 1 })).toEqual([
			scored[2],
			scored[0],
			scored[1],
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
			people: [at(0)],
		}));

		expect(bestWindows(many, { minSlots: 1, minPeople: 1 })).toHaveLength(5);
	});
});
