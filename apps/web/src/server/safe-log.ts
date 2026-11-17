// Rule 7 of AGENTS.md and ADR 0003 item 8: no secret or visitor value reaches a log. Drizzle
// puts a failed query's parameters into its error message, and PostgreSQL puts row values into
// the `detail` of its error, so an uncaught query error that Next.js logs would print them.
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";

/**
 * A failed query reduced to what diagnosis needs: the parameterized SQL, the SQLSTATE and the
 * constraint. Every other value is returned as it is.
 */
export function withoutValues<Value>(value: Value): Value | Error {
	if (!(value instanceof DrizzleQueryError)) {
		return value;
	}

	const cause = value.cause instanceof DatabaseError ? value.cause : undefined;

	const reason =
		cause === undefined
			? ""
			: ` (SQLSTATE ${cause.code ?? "unknown"}, constraint ${cause.constraint ?? "none"})`;

	const safe = new Error(`Failed query: ${value.query}${reason}`);
	const frames = value.stack?.indexOf("\n    at") ?? -1;

	// The stack starts with the original message, which holds the parameters.
	safe.stack =
		frames === -1 ? safe.message : `Error: ${safe.message}${value.stack?.slice(frames) ?? ""}`;

	return safe;
}

const LEVELS = ["error", "warn", "info", "log", "debug"] as const;

/** Makes every console level pass its arguments through `withoutValues` first. */
export function installSafeConsole(): void {
	for (const level of LEVELS) {
		const original = console[level].bind(console);

		console[level] = (...values: unknown[]) => {
			original(...values.map((value) => withoutValues(value)));
		};
	}
}
