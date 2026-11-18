import { describe, expect, it } from "vitest";

import { hashSecret, matchesSecret, newSecret } from "./secrets";

describe("secrets (ADR 0004)", () => {
	it("names the kind in a prefix before 32 random bytes in base64url", () => {
		expect(newSecret("admin")).toMatch(/^cva_[\w-]{43}$/u);
		expect(newSecret("participant")).toMatch(/^cvp_[\w-]{43}$/u);
		expect(newSecret("admin")).not.toBe(newSecret("admin"));
	});

	it("hashes the whole secret, so the random part alone or under the other prefix does not match", () => {
		const secret = newSecret("admin");
		const random = secret.slice("cva_".length);
		const stored = hashSecret(secret);

		expect(matchesSecret(stored, secret)).toBe(true);
		expect(matchesSecret(stored, random)).toBe(false);
		expect(matchesSecret(stored, `cvp_${random}`)).toBe(false);
	});
});
