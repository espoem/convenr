import { describe, expect, it } from "vitest";

import { readUnsubscribeValue, type Unsubscription, unsubscribeValue } from "./unsubscribe-value";

const secret = "test-secret-that-is-long-enough-for-accounts";
const jana: Unsubscription = { accountId: "jana", eventId: "VvMDDdnMVWN6", kind: "reminder" };

describe("unsubscribe value", () => {
	it("names the account, the event and the kind it was signed for", () => {
		expect(readUnsubscribeValue(unsubscribeValue(jana, secret), secret)).toEqual(jana);
	});

	it("is refused when it was signed with another secret or changed", () => {
		const value = unsubscribeValue(jana, secret);
		const other = unsubscribeValue({ ...jana, kind: "final" }, secret);
		const [payload] = other.split(".");
		const [, signature] = value.split(".");

		expect(readUnsubscribeValue(value, `${secret}-other`)).toBeUndefined();
		expect(readUnsubscribeValue(`${payload}.${signature}`, secret)).toBeUndefined();
		expect(readUnsubscribeValue(`${value}.extra`, secret)).toBeUndefined();
		expect(readUnsubscribeValue("", secret)).toBeUndefined();
	});
});
