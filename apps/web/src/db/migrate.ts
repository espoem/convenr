import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./client";

// Any fixed number works; it only has to differ from other advisory locks of this database.
const MIGRATION_LOCK = 4_242_001;

function migrationsFolder(): string {
	// Next.js server chunks leave `import.meta.dirname` undefined at runtime; standalone `server.js`
	// already sets cwd to `apps/web`, whereas standalone `scripts/migrate.mts` has `dirname`.
	const moduleDir: string | undefined = import.meta.dirname;

	if (moduleDir !== undefined) {
		const besideModule = resolve(moduleDir, "../../drizzle");

		if (existsSync(join(besideModule, "meta/_journal.json"))) {
			return besideModule;
		}
	}

	return join(process.cwd(), "drizzle");
}

/**
 * Applies the pending SQL migrations from `drizzle/`. An advisory lock makes servers that
 * start at the same time apply them once.
 */
export async function applyMigrations(database: Database): Promise<void> {
	await database.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${MIGRATION_LOCK})`);
		await migrate(tx, { migrationsFolder: migrationsFolder() });
	});
}
