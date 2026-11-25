import { describe, expect, it } from "vitest";

import { eventIdFromSegment, eventSegment } from "./event-address";
import { isPublicId, newPublicId, PUBLIC_ID_ALPHABET, PUBLIC_ID_LENGTH } from "./public-id";

const id = "Ab3dEf7hJk9m";

describe("event address", () => {
	it("puts the slug before the id", () => {
		expect(eventSegment(id, "Schůzka výboru 2027")).toBe(`schuzka-vyboru-2027-${id}`);
	});

	it("uses the id alone when the name gives no slug", () => {
		expect(eventSegment(id, "会议")).toBe(id);
	});

	it("selects the event by the text after the last hyphen, whatever the slug says", () => {
		expect(eventIdFromSegment(`schuzka-vyboru-2027-${id}`)).toBe(id);
		expect(eventIdFromSegment(`an-old-name-${id}`)).toBe(id);
		expect(eventIdFromSegment(id)).toBe(id);
	});

	it("selects nothing when the last part is not an event id", () => {
		expect(eventIdFromSegment("")).toBeUndefined();
		expect(eventIdFromSegment("-")).toBeUndefined();
		expect(eventIdFromSegment(`schuzka-${id}-`)).toBeUndefined();
		expect(eventIdFromSegment("schuzka-vyboru-2027")).toBeUndefined();
		expect(eventIdFromSegment(`x-${id.slice(1)}0`)).toBeUndefined();
		expect(eventIdFromSegment(`x-${id.slice(0, -1)}_`)).toBeUndefined();
		expect(eventIdFromSegment(`x-${id}a`)).toBeUndefined();
	});

	it("round-trips a segment with multiple hyphens in the title", () => {
		const segment = eventSegment(id, "Tea — 2nd / Spring-Check");

		expect(eventIdFromSegment(segment)).toBe(id);
	});
});

describe("public id (ADR 0003)", () => {
	it("has 12 characters from an alphabet of 57 without look-alikes or hyphens", () => {
		expect(PUBLIC_ID_ALPHABET).toHaveLength(57);
		expect(PUBLIC_ID_ALPHABET).not.toMatch(/[0O1lI-]/u);

		for (let attempt = 0; attempt < 200; attempt += 1) {
			const generated = newPublicId();

			expect(generated).toHaveLength(PUBLIC_ID_LENGTH);
			expect(isPublicId(generated)).toBe(true);
		}
	});
});
