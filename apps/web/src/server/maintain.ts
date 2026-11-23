// The maintenance pass as the server runs it: from its hourly timer, or when a schedule outside
// calls `POST /api/maintenance` (ADR 0010).
import { db } from "@/db/client";
import { env } from "@/env";

import { runMaintenance } from "./maintenance";
import { queueDue } from "./notifications";
import { deliverOutbox } from "./outbox";

/**
 * Runs the maintenance pass at `now`: the SQL part, then, with accounts on, the digests and
 * reminders that came due and the emails waiting in the outbox. Answers how many expired events
 * it deleted and how many emails it sent.
 */
export async function maintain(
	now = Temporal.Now.instant(),
): Promise<{ deleted: number; sent: number }> {
	const deleted = await runMaintenance(db().$client, env().RETENTION_DAYS, now.toString());

	if (env().accounts.kind === "off") {
		return { deleted, sent: 0 };
	}

	await queueDue(now);

	return { deleted, sent: await deliverOutbox(now) };
}
