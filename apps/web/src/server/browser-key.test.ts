import { describe, expect, it } from "vitest";

import {
	browserToken,
	formatBrowserKey,
	needsRenewal,
	parseBrowserKey,
	renewed,
} from "./browser-key";

const key = "a".repeat(43);

describe("the browser key", () => {
	it("reads back what it writes", () => {
		const stored = { key, renewedOn: Temporal.PlainDate.from("2026-11-21") };

		expect(parseBrowserKey(formatBrowserKey(stored))).toEqual(stored);
	});

	it("reads anything else as no key", () => {
		for (const value of [
			undefined,
			"",
			key,
			`${key}.2026-02-30`,
			`${key}.2026-11-21.x`,
			`${"a".repeat(42)}.2026-11-21`,
			`${"a".repeat(42)}+.2026-11-21`,
		]) {
			expect(parseBrowserKey(value)).toBeUndefined();
		}
	});

	it("is renewed once a day at most", () => {
		const today = Temporal.Now.plainDateISO("UTC");
		const old = { key, renewedOn: today.subtract({ days: 1 }) };

		expect(needsRenewal(old)).toBe(true);
		expect(needsRenewal(renewed(old))).toBe(false);
		expect(renewed(old).key).toBe(key);
	});
});

describe("a browser token", () => {
	it("is a participant token that differs per event and per key", () => {
		const other = "b".repeat(43);
		const token = browserToken(key, "event-one");

		expect(token).toMatch(/^cvp_[\w-]{43}$/u);
		expect(browserToken(key, "event-one")).toBe(token);
		expect(browserToken(key, "event-two")).not.toBe(token);
		expect(browserToken(other, "event-one")).not.toBe(token);
	});
});
