import { describe, expect, it } from "vitest";

import { authAddress, githubAddress, googleAddress } from "./provider-address";

describe("Google's answer", () => {
	it("proves a verified address of its own, in any case", () => {
		expect(googleAddress({ email: "jana@gmail.com", email_verified: true })).toEqual({
			kind: "proved",
			email: "jana@gmail.com",
		});
		expect(googleAddress({ email: "Jana@GMAIL.com", email_verified: true }).kind).toBe("proved");
	});

	it("proves a verified address of a domain it hosts", () => {
		expect(
			googleAddress({ email: "jana@spolek.example", email_verified: true, hd: "spolek.example" })
				.kind,
		).toBe("proved");
	});

	it("does not prove a verified address of any other domain", () => {
		expect(googleAddress({ email: "jana@example.org", email_verified: true })).toEqual({
			kind: "unproved",
			email: "jana@example.org",
		});
		expect(googleAddress({ email: "jana@example.org", email_verified: true, hd: "" }).kind).toBe(
			"unproved",
		);
	});

	it.each(["jana@gmail.com.example.org", "jana@notgmail.com", "jana@mail.gmail.com"])(
		"does not take %s for an address of its own",
		(email) => {
			expect(googleAddress({ email, email_verified: true }).kind).toBe("unproved");
		},
	);

	it("does not prove an address it did not verify", () => {
		expect(googleAddress({ email: "jana@gmail.com" }).kind).toBe("unproved");
		expect(googleAddress({ email: "jana@spolek.example", hd: "spolek.example" }).kind).toBe(
			"unproved",
		);
	});

	it("can hold no address", () => {
		expect(googleAddress({})).toEqual({ kind: "missing" });
		expect(googleAddress({ email: "not an address" })).toEqual({ kind: "missing" });
	});
});

describe("GitHub's answer", () => {
	const other = { email: "other@example.org", primary: false, verified: true };

	it("names the primary address but does not prove it, even when GitHub verified it", () => {
		for (const verified of [true, false]) {
			expect(
				githubAddress([other, { email: "petr@example.org", primary: true, verified }]),
			).toEqual({ kind: "unproved", email: "petr@example.org" });
		}
	});

	it("holds no address without a primary one, or with one that receives no mail", () => {
		expect(githubAddress([])).toEqual({ kind: "missing" });
		expect(githubAddress([other])).toEqual({ kind: "missing" });
		expect(
			githubAddress([
				{ email: "1+petr@users.noreply.GitHub.com", primary: true, verified: true },
				other,
			]),
		).toEqual({ kind: "missing" });
	});
});

describe("the address given to Better Auth", () => {
	it("is the proved one", () => {
		expect(authAddress("google", "7", { kind: "proved", email: "jana@gmail.com" })).toEqual({
			email: "jana@gmail.com",
			emailVerified: true,
		});
	});

	it("is a placeholder for any other, so the unproved one is never looked up", () => {
		const placeholder = { email: "7@github.invalid", emailVerified: false };

		expect(authAddress("github", "7", { kind: "unproved", email: "petr@example.org" })).toEqual(
			placeholder,
		);
		expect(authAddress("github", "7", { kind: "missing" })).toEqual(placeholder);
	});
});
