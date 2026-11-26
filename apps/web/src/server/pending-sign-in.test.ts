import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
	followsLink,
	newLinkKey,
	type PendingSignIn,
	pendingValue,
	readPendingValue,
} from "./pending-sign-in";

const SECRET = "s".repeat(32);
const now = Temporal.Instant.from("2026-11-26T12:00:00Z");
const key = newLinkKey();

const pending: PendingSignIn = {
	kind: "sent",
	provider: "github",
	subject: "7",
	address: "petr@example.org",
	startedAt: now.epochMilliseconds,
	to: "petr@example.org",
	sentAt: now.add({ minutes: 10 }).epochMilliseconds,
	keyHash: createHash("sha256").update(key).digest("base64url"),
};

describe("the pending sign-in value", () => {
	it("reads back what this server signed", () => {
		expect(readPendingValue(pendingValue(pending, SECRET), SECRET, now)).toEqual(pending);
	});

	it("is refused when anything in it changed or another secret signed it", () => {
		const value = pendingValue(pending, SECRET);
		const [, signature] = value.split(".");
		const forged = Buffer.from(JSON.stringify({ ...pending, subject: "8" })).toString("base64url");

		expect(readPendingValue(`${forged}.${signature}`, SECRET, now)).toBeUndefined();
		expect(readPendingValue(value, "t".repeat(32), now)).toBeUndefined();
		expect(readPendingValue("not a value", SECRET, now)).toBeUndefined();
	});

	it("lasts 15 minutes from the provider's answer, however late the link was sent", () => {
		const value = pendingValue(pending, SECRET);

		expect(readPendingValue(value, SECRET, now.add({ minutes: 15 }))).toEqual(pending);
		expect(readPendingValue(value, SECRET, now.add({ minutes: 15, seconds: 1 }))).toBeUndefined();
		expect(readPendingValue(value, SECRET, now.subtract({ seconds: 1 }))).toBeUndefined();
	});

	it("is finished only by the key of the link that was sent", () => {
		expect(followsLink(pending, key)).toBe(true);
		expect(followsLink(pending, newLinkKey())).toBe(false);
		expect(followsLink(pending, "")).toBe(false);
	});
});
