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
		expect(heatStep(available, participants)).toBe(step);
	});
});
