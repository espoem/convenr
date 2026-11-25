import { describe, expect, it } from "vitest";

import { isFresh } from "./session";

function signedInFor(age: Temporal.DurationLike) {
	return isFresh({
		kind: "signed_in",
		accountId: "account",
		email: "jana@example.org",
		sessionId: "session",
		sessionCreatedAt: Temporal.Now.instant().subtract(age),
	});
}

describe("a fresh sign-in", () => {
	it("is under a day old", () => {
		expect(signedInFor({ hours: 23, minutes: 59 })).toBe(true);
		expect(signedInFor({ hours: 24 })).toBe(false);
	});
});
