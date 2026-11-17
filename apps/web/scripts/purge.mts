// The purge command of Phase 2 rule X4: deletes expired events once and prints how many. An
// operator can schedule it from outside; the server also runs it every hour. It reads the same
// DATABASE_URL and RETENTION_DAYS as the server and needs only Node and `pg`, so it also runs
// in the container image: `node apps/web/scripts/purge.mts`.
import { Pool } from "pg";

import { purgeExpired } from "../src/server/purge.ts";

function retention(text: string | undefined): number | "never" {
	if (text === undefined || text === "") {
		return 90;
	}

	if (text === "never") {
		return text;
	}

	const days = Number(text);

	if (!Number.isInteger(days) || days < 1) {
		throw new Error("RETENTION_DAYS must be a whole number of days of at least 1, or never.");
	}

	return days;
}

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined || connectionString === "") {
	console.error("Set DATABASE_URL to the database to purge.");
	process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

try {
	const deleted = await purgeExpired(
		pool,
		retention(process.env["RETENTION_DAYS"]),
		Temporal.Now.instant().toString(),
	);

	console.log(`Deleted ${deleted} expired events.`);
} finally {
	await pool.end();
}
