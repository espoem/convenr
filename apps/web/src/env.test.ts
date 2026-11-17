import { describe, expect, it } from "vitest";

import { parseEnv } from "./env";

describe("parseEnv", () => {
	it("accepts a postgres URL", () => {
		const url = "postgres://user:secret@db:5432/convenr";
		expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
	});

	it("accepts the postgresql scheme", () => {
		expect(() => parseEnv({ DATABASE_URL: "postgresql://user@localhost/convenr" })).not.toThrow();
	});

	it("rejects a missing database URL", () => {
		expect(() => parseEnv({})).toThrow(/DATABASE_URL/u);
	});

	it("rejects a URL for another database", () => {
		expect(() => parseEnv({ DATABASE_URL: "mysql://user@localhost/convenr" })).toThrow(
			/DATABASE_URL/u,
		);
	});
});
