import { describe, expect, it } from "vitest";

import { heatStep } from "./heat";

describe("heat steps", () => {
	it.each([
		[0, 0, 0],
		[0, 5, 0],
		[1, 4, 1],
		[1, 10, 1],
		[2, 5, 2],
		[1, 2, 2],
		[2, 3, 3],
		[3, 4, 3],
		[4, 5, 4],
		[10, 10, 4],
	])("%i of %i available is step %i", (available, participants, step) => {
		expect(heatStep({ available, ifNeedBe: 0 }, participants)).toBe(step);
	});

	it.each([
		// ½ of 2 is 25 %.
		[0, 1, 2, 1],
		// 1½ of 3 is 50 %.
		[1, 1, 3, 2],
		// 3 of 4 is 75 %, and one more half goes above it.
		[2, 2, 4, 3],
		[3, 1, 4, 4],
		// Everyone at if need be scores half.
		[0, 4, 4, 2],
	])(
		"%i available and %i if need be of %i is step %i",
		(available, ifNeedBe, participants, step) => {
			expect(heatStep({ available, ifNeedBe }, participants)).toBe(step);
		},
	);
});
