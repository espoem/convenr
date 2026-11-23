// The maintenance pass as the server runs it: from its hourly timer, or when a schedule outside
// calls `POST /api/maintenance` (ADR 0010).
import { db } from "@/db/client";
import { env } from "@/env";

import { runMaintenance } from "./maintenance";

/** Runs the maintenance pass at `now` and answers how many expired events it deleted. */
export async function maintain(now = Temporal.Now.instant()): Promise<{ deleted: number }> {
	const deleted = await runMaintenance(db().$client, env().RETENTION_DAYS, now.toString());

	return { deleted };
}
