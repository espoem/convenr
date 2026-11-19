import { describe, expect, it } from "vitest";

import {
	cellLevel,
	headsOf,
	pressedLevel,
	sameLevels,
	savedLevels,
	scoreOf,
	slotsAt,
	withLevel,
} from "./levels";

describe("score and heads", () => {
	it("counts an available person 1 and one at if need be ½", () => {
		expect(scoreOf({ available: 3, ifNeedBe: 1 })).toBe(3.5);
		expect(headsOf({ available: 3, ifNeedBe: 1 })).toBe(4);
	});
});

describe("cellLevel", () => {
	const levels = { a: "available", b: "if_need_be" } as const;

	it("is the level of the cell's slot, or none without one", () => {
		expect(cellLevel(levels, ["a"])).toBe("available");
		expect(cellLevel(levels, ["b"])).toBe("if_need_be");
		expect(cellLevel(levels, ["c"])).toBeNull();
		expect(cellLevel(levels, [])).toBeNull();
	});

	it("needs a level in both slots of a cell, and is if need be when either is", () => {
		expect(cellLevel(levels, ["a", "b"])).toBe("if_need_be");
		expect(cellLevel(levels, ["a", "c"])).toBeNull();
	});
});

describe("savedLevels", () => {
	const stored = { a: "if_need_be", b: "available" } as const;

	it("sets the levels a save names and drops every other slot", () => {
		expect(savedLevels({ available: ["a", "c"], ifNeedBe: ["c"] }, stored)).toEqual({
			ok: true,
			levels: { a: "available", c: "if_need_be" },
		});
	});

	it("makes every slot available with an empty if-need-be list", () => {
		expect(savedLevels({ available: ["a", "b"], ifNeedBe: [] }, stored)).toEqual({
			ok: true,
			levels: { a: "available", b: "available" },
		});
	});

	it("keeps the stored levels without an if-need-be list, and makes new slots available", () => {
		expect(savedLevels({ available: ["a", "c"] }, stored)).toEqual({
			ok: true,
			levels: { a: "if_need_be", c: "available" },
		});
	});

	it("refuses a slot at if need be that is not among the marked ones", () => {
		expect(savedLevels({ available: ["a"], ifNeedBe: ["a", "b", "d"] }, stored)).toEqual({
			ok: false,
			notAvailable: [1, 2],
		});
	});

	it("counts a slot listed twice once", () => {
		expect(savedLevels({ available: ["a", "a"], ifNeedBe: ["a", "a"] }, {})).toEqual({
			ok: true,
			levels: { a: "if_need_be" },
		});
	});
});

describe("painting", () => {
	it("gives a cell the brush's level, or clears it when it already has that level", () => {
		expect(pressedLevel(null, "available")).toBe("available");
		expect(pressedLevel("available", "if_need_be")).toBe("if_need_be");
		expect(pressedLevel("if_need_be", "if_need_be")).toBeNull();
		expect(pressedLevel("available", "clear")).toBeNull();
		expect(pressedLevel(null, "clear")).toBeNull();
	});

	it("sets or clears every slot of a rectangle and leaves the rest", () => {
		const levels = { a: "available", b: "if_need_be" } as const;

		expect(withLevel(levels, ["b", "c"], "available")).toEqual({
			a: "available",
			b: "available",
			c: "available",
		});
		expect(withLevel(levels, ["a"], null)).toEqual({ b: "if_need_be" });
		expect(slotsAt(levels, "if_need_be")).toEqual(["b"]);
	});
});

describe("sameLevels", () => {
	it("compares slots and their levels", () => {
		expect(sameLevels({ a: "available" }, { a: "available" })).toBe(true);
		expect(sameLevels({ a: "available" }, { a: "if_need_be" })).toBe(false);
		expect(sameLevels({ a: "available" }, { a: "available", b: "available" })).toBe(false);
	});
});
