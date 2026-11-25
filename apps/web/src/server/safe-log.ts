// ADR 0003 item 8: no secret or visitor value reaches a log. Drizzle
// puts a failed query's parameters into its error message, and PostgreSQL puts row values into
// the `detail` of its error, so an uncaught query error that Next.js logs would print them.
import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { z } from "zod";

function databaseMessage(query: string | undefined, cause: DatabaseError | undefined): string {
	const reason =
		cause === undefined
			? ""
			: ` (SQLSTATE ${cause.code ?? "unknown"}, constraint ${cause.constraint ?? "none"})`;

	return query === undefined ? `Database error${reason}` : `Failed query: ${query}${reason}`;
}

function sanitizeDatabaseError(message: string, original: Error): Error {
	const safe = new Error(message);
	const frames = original.stack?.indexOf("\n    at") ?? -1;

	// The stack starts with the original message, which holds the parameters.
	safe.stack =
		frames === -1 ? safe.message : `Error: ${safe.message}${original.stack?.slice(frames) ?? ""}`;

	return safe;
}

function sanitizeError(error: Error, seen: WeakSet<object>): Error | undefined {
	if (seen.has(error)) {
		return undefined;
	}

	seen.add(error);

	if (error instanceof DrizzleQueryError) {
		const cause = error.cause instanceof DatabaseError ? error.cause : undefined;

		return sanitizeDatabaseError(databaseMessage(error.query, cause), error);
	}

	if (error instanceof DatabaseError) {
		return sanitizeDatabaseError(databaseMessage(undefined, error), error);
	}

	const nextCause = error.cause instanceof Error ? sanitizeError(error.cause, seen) : undefined;

	const parsedErrors =
		error instanceof AggregateError
			? z.array(z.instanceof(Error)).safeParse(error.errors)
			: undefined;

	const nextErrors =
		parsedErrors?.success === true
			? parsedErrors.data.map((item) => sanitizeError(item, seen))
			: undefined;

	if (
		nextCause === undefined &&
		(nextErrors === undefined || nextErrors.every((e) => e === undefined))
	) {
		return undefined;
	}

	const copy = new Error(error.message, nextCause === undefined ? undefined : { cause: nextCause });

	copy.name = error.name;

	if (error.stack !== undefined) {
		copy.stack = error.stack;
	}

	if (parsedErrors?.success === true && nextErrors !== undefined) {
		const aggregate = new AggregateError(
			parsedErrors.data.map((item, index) => nextErrors[index] ?? item),
			error.message,
			nextCause === undefined ? undefined : { cause: nextCause },
		);

		aggregate.name = error.name;

		return aggregate;
	}

	return copy;
}

/**
 * A failed query reduced to what diagnosis needs: the parameterized SQL, the SQLSTATE and the
 * constraint. Every other value is returned as it is.
 */
export function withoutValues<Value>(value: Value): Value | Error {
	if (!(value instanceof Error)) {
		return value;
	}

	return sanitizeError(value, new WeakSet()) ?? value;
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
