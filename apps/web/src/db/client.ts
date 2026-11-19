import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";

export type Database = ReturnType<typeof connect>;

/** A database over its own pool. Tests use it for a separate database. */
export function connect(connectionString: string) {
	const pool = new Pool({
		connectionString,
		max: 10,
		// Without a limit a request waits forever for a database that does not answer.
		connectionTimeoutMillis: 10_000,
		// Short-lived serverless instances should not hold connections they no longer use.
		idleTimeoutMillis: 5000,
	});

	return drizzle(pool, { casing: "snake_case" });
}

// One pool per process. Development reloads modules, so the pool is kept on globalThis there.
declare global {
	var convenrDatabase: Database | undefined;
}

export function db(): Database {
	globalThis.convenrDatabase ??= connect(env().DATABASE_URL);

	return globalThis.convenrDatabase;
}
