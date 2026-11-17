// The usage command of Phase 2 rule U7: prints the daily usage counts. Without arguments it
// covers the last 30 days up to today in UTC; `node apps/web/scripts/usage.mts 2027-03-01
// 2027-03-31` covers a range, both days included. It reads DATABASE_URL and needs only Node
// and `pg`, so it also runs in the container image.
import { Pool } from "pg";

import { type UsageCount, usageReport } from "../src/domain/usage.ts";

const [fromText, toText] = process.argv.slice(2);
const today = Temporal.Now.plainDateISO("UTC");
const to = toText === undefined ? today : Temporal.PlainDate.from(toText);
const from = fromText === undefined ? to.subtract({ days: 29 }) : Temporal.PlainDate.from(fromText);

if (Temporal.PlainDate.compare(from, to) > 0) {
	console.error("The first day of the range comes after the last.");
	process.exit(1);
}

const connectionString = process.env["DATABASE_URL"];

if (connectionString === undefined || connectionString === "") {
	console.error("Set DATABASE_URL to the database to read.");
	process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });

try {
	const result = await pool.query<UsageCount>(
		"select day::text as day, metric, bucket, count from usage_counts where day between $1 and $2",
		[from.toString(), to.toString()],
	);

	console.log(usageReport(result.rows, from, to));
} finally {
	await pool.end();
}
