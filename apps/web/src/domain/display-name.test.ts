import { describe, expect, it } from "vitest";

import { parseDisplayName } from "./display-name";

function nameOf(raw: string): string | undefined {
	const result = parseDisplayName(raw);

	return result.ok ? result.name : undefined;
}

function keyOf(raw: string): string | undefined {
	const result = parseDisplayName(raw);

	return result.ok ? result.key : undefined;
}

describe("P1 display name", () => {
	it("trims and collapses runs of whitespace to one space", () => {
		expect(nameOf("  Jana \t\n Nováková  ")).toBe("Jana Nováková");
	});

	it("normalizes to NFC", () => {
		expect(nameOf("Jána")).toBe("Jána");
	});

	it("accepts 40 characters and refuses 41, counting an emoji sequence once", () => {
		const family = "👨‍👩‍👧";

		expect(parseDisplayName(`${"a".repeat(39)}${family}`).ok).toBe(true);
		expect(parseDisplayName("a".repeat(41))).toEqual({ ok: false, reason: "too_long" });
	});

	it("refuses an empty name and a name with a control character", () => {
		expect(parseDisplayName("   ")).toEqual({ ok: false, reason: "empty" });
		expect(parseDisplayName("Ja\u0000na")).toEqual({ ok: false, reason: "control_character" });
	});
});

describe("P2 uniqueness key", () => {
	it("treats names that differ only in case and spacing as the same name", () => {
		expect(new Set(["Jana", "jana", " JANA "].map((name) => keyOf(name)))).toEqual(
			new Set(["jana"]),
		);
	});

	it("keeps names with different letters apart", () => {
		expect(keyOf("Jana")).not.toBe(keyOf("Jána"));
	});
});
