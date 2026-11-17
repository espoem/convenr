import { inspect } from "node:util";

import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { describe, expect, it } from "vitest";

import { withoutValues } from "./safe-log";

const SECRET = "c2VjcmV0LWFkbWluLWhhc2g";

function failedInsert(): DrizzleQueryError {
	const cause = new DatabaseError(
		'duplicate key value violates unique constraint "events_pkey"',
		0,
		"error",
	);

	cause.code = "23505";
	cause.constraint = "events_pkey";
	cause.detail = `Key (admin_secret_hash)=(${SECRET}) already exists.`;

	return new DrizzleQueryError(
		'insert into "events" ("id", "admin_secret_hash") values ($1, $2)',
		["abcdefghijkm", SECRET],
		cause,
	);
}

describe("withoutValues (rule 7, ADR 0003 item 8)", () => {
	it("keeps the query, the SQLSTATE and the constraint of a failed query", () => {
		const logged = inspect(withoutValues(failedInsert()));

		expect(logged).toContain('insert into "events"');
		expect(logged).toContain("23505");
		expect(logged).toContain("events_pkey");
	});

	it("drops the parameters and the error detail, also from the stack", () => {
		const logged = inspect(withoutValues(failedInsert()));

		expect(logged).not.toContain(SECRET);
		expect(logged).not.toContain("abcdefghijkm");
	});

	it("passes every other value through unchanged", () => {
		const error = new Error("plain");

		expect(withoutValues(error)).toBe(error);
		expect(withoutValues("text")).toBe("text");
	});
});
