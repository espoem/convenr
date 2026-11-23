// Picking and clearing the final time, by the admin secret or the owner. Each change locks the
// event row, like every other change of the event.
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events } from "@/db/schema";
import {
	type FinalProblem,
	type FinalRequest,
	type FinalTime,
	finalWindow,
} from "@/domain/final-time";
import type { EventVersion } from "@/lib/event-version";

import { changeStamp, type EventRow, finalOf, OPEN_FINAL, scheduleOf } from "./event-rows";
import { type EventView, eventViewOf } from "./events";
import { type AdminAccess, adminRow, type Precondition } from "./manage";
import { noteFinal } from "./notifications";
import { countTimeToFinal } from "./usage";

export type FinalResult =
	/** The event as the change wrote it. */
	| { status: "saved"; event: EventView }
	| { status: "denied" }
	| { status: "invalid"; problem: FinalProblem }
	/** The current version differs from every version the precondition names. */
	| { status: "changed"; version: EventVersion };

type Change = { kind: "pick"; request: FinalRequest } | { kind: "clear" };

const ANY_VERSION: Precondition = { kind: "any" };

type Columns = Partial<typeof events.$inferInsert>;

/**
 * The columns `change` writes over `current`, `null` when it keeps the event as it is, or the
 * problem that refuses it. A pick of the final time already chosen changes nothing, so the
 * calendar sequence stays.
 */
function columnsOf(
	row: EventRow,
	current: FinalTime,
	change: Change,
	now: Temporal.Instant,
): { ok: true; columns: Columns | null } | { ok: false; problem: FinalProblem } {
	if (change.kind === "clear") {
		return { ok: true, columns: current.kind === "open" ? null : OPEN_FINAL };
	}

	const window = finalWindow(scheduleOf(row), change.request, now);

	if (!window.ok) {
		return window;
	}

	const same =
		current.kind === "chosen" &&
		current.start.equals(window.start) &&
		current.end.equals(window.end);

	const columns: Columns = {
		finalState: "chosen",
		finalStart: window.start.toString(),
		finalEnd: window.end.toString(),
		finalSequence: current.sequence + 1,
	};

	return { ok: true, columns: same ? null : columns };
}

async function changeFinal(
	id: string,
	access: AdminAccess,
	change: Change,
	precondition: Precondition,
	now: Temporal.Instant,
): Promise<FinalResult> {
	return db().transaction(async (tx): Promise<FinalResult> => {
		const row = await adminRow(tx, id, access, "lock", now);

		if (row === undefined) {
			return { status: "denied" };
		}

		if (precondition.kind === "match" && !precondition.versions.includes(row.version)) {
			return { status: "changed", version: row.version };
		}

		const planned = columnsOf(row, finalOf(row), change, now);

		if (!planned.ok) {
			return { status: "invalid", problem: planned.problem };
		}

		if (planned.columns === null) {
			return { status: "saved", event: await eventViewOf(tx, row) };
		}

		if (change.kind === "pick") {
			await countTimeToFinal(tx, row, now);
		}

		const [written] = await tx
			.update(events)
			.set({ ...planned.columns, ...changeStamp(now) })
			.where(eq(events.id, id))
			.returning();

		if (written === undefined) {
			throw new Error("The final time update returned no row.");
		}

		// Picking a final time leaves the options as they are.
		const changed = { ...written, options: row.options };

		await noteFinal(tx, changed, now);

		return { status: "saved", event: await eventViewOf(tx, changed) };
	});
}

/** Picks `request` as the final time of event `id`, or changes it to that window. */
export async function pickFinal(
	id: string,
	access: AdminAccess,
	request: FinalRequest,
	precondition: Precondition = ANY_VERSION,
	now = Temporal.Now.instant(),
): Promise<FinalResult> {
	return changeFinal(id, access, { kind: "pick", request }, precondition, now);
}

/** Clears the final time of event `id`; responses stay as they are. */
export async function clearFinal(
	id: string,
	access: AdminAccess,
	precondition: Precondition = ANY_VERSION,
	now = Temporal.Now.instant(),
): Promise<FinalResult> {
	return changeFinal(id, access, { kind: "clear" }, precondition, now);
}
