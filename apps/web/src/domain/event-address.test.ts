import { describe, expect, it } from "vitest";

import { eventIdFromSegment, eventSegment } from "./event-address";
import { EVENT_ID_ALPHABET, EVENT_ID_LENGTH, isEventId, newEventId } from "./event-id";

const id = "Ab3dEf7hJk9m";

describe("E10 event address", () => {
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
		expect(eventIdFromSegment("schuzka-vyboru-2027")).toBeUndefined();
		expect(eventIdFromSegment(`x-${id.slice(1)}0`)).toBeUndefined();
	});
});

describe("event id (ADR 0003)", () => {
	it("has 12 characters from an alphabet of 57 without look-alikes or hyphens", () => {
		expect(EVENT_ID_ALPHABET).toHaveLength(57);
		expect(EVENT_ID_ALPHABET).not.toMatch(/[0O1lI-]/u);

		for (let attempt = 0; attempt < 200; attempt += 1) {
			const generated = newEventId();

			expect(generated).toHaveLength(EVENT_ID_LENGTH);
			expect(isEventId(generated)).toBe(true);
		}
	});
});
