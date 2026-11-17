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

	it("reads the retention period as days or never (X1)", () => {
		const url = "postgres://user@localhost/convenr";

		expect(parseEnv({ DATABASE_URL: url }).RETENTION_DAYS).toBe(90);
		expect(parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "30" }).RETENTION_DAYS).toBe(30);
		expect(parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "never" }).RETENTION_DAYS).toBe("never");
		expect(() => parseEnv({ DATABASE_URL: url, RETENTION_DAYS: "0" })).toThrow(/RETENTION_DAYS/u);
	});

	it("rejects a URL for another database", () => {
		expect(() => parseEnv({ DATABASE_URL: "mysql://user@localhost/convenr" })).toThrow(
			/DATABASE_URL/u,
		);
	});
});
