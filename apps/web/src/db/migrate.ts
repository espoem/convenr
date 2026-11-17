import { join } from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./client";

// Any fixed number works; it only has to differ from other advisory locks of this database.
const MIGRATION_LOCK = 4_242_001;

/**
 * Applies the pending SQL migrations from `drizzle/`. An advisory lock makes servers that
 * start at the same time apply them once.
 */
export async function applyMigrations(database: Database): Promise<void> {
	await database.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK})`);
		await migrate(tx, { migrationsFolder: join(process.cwd(), "drizzle") });
	});
}
