// Applies pending migrations with the server's own migrator and lock, for platforms where
// the server does not migrate at start (ADR 0005). Run it from apps/web, which holds `drizzle/`.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { applyMigrations } from "../src/db/migrate.ts";

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined || connectionString === "") {
	console.error("Set DATABASE_URL to the database to migrate.");
	process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

try {
	await applyMigrations(drizzle(pool));
	console.log("Migrations are up to date.");
} finally {
	await pool.end();
}
