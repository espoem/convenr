// Events an account owns. An account adds an event with its admin secret; from then on it
// manages the event from any browser where it is signed in, and the admin link keeps working.
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events } from "@/db/schema";
import { eventSegment } from "@/domain/event-address";
import type { FinalTime } from "@/domain/final-time";

import { finalOf, isLive, withOptions } from "./event-rows";
import { deletionDateOf } from "./events";
import { adminRow, bySecret } from "./manage";

export type ClaimResult =
	| { status: "claimed" }
	/** The account owns the event already; nothing changed. */
	| { status: "already_owned" }
	/** Another account owns the event; nothing changed. */
	| { status: "event_has_owner" }
	/** The event is unknown or expired, or the secret does not fit. */
	| { status: "wrong_admin_secret" };

/** Makes `accountId` the owner of event `id`, whose admin secret is `secret`. */
export async function claimEvent(
	id: string,
	secret: string,
	accountId: string,
	now = Temporal.Now.instant(),
): Promise<ClaimResult> {
	return db().transaction(async (tx): Promise<ClaimResult> => {
		const row = await adminRow(tx, id, bySecret(secret), "lock", now);

		if (row === undefined) {
			return { status: "wrong_admin_secret" };
		}

		if (row.ownerId === accountId) {
			return { status: "already_owned" };
		}

		if (row.ownerId !== null) {
			return { status: "event_has_owner" };
		}

		// Ownership is not part of what participants see, so the event's version stays.
		await tx.update(events).set({ ownerId: accountId }).where(eq(events.id, id));

		return { status: "claimed" };
	});
}

/** Whether `accountId` owns event `id`. */
export async function owns(accountId: string, id: string): Promise<boolean> {
	const [row] = await db()
		.select({ id: events.id })
		.from(events)
		.where(and(eq(events.id, id), eq(events.ownerId, accountId)));

	return row !== undefined;
}

/** An event in the account's list. */
export type OwnedEvent = {
	id: string;
	name: string;
	segment: string;
	deletionDate: Temporal.PlainDate | null;
	final: FinalTime;
};

/** The live events `accountId` owns, the most recently created first. */
export async function ownedEvents(
	accountId: string,
	now = Temporal.Now.instant(),
): Promise<OwnedEvent[]> {
	const rows = await db()
		.select()
		.from(events)
		.where(eq(events.ownerId, accountId))
		.orderBy(desc(events.createdAt));

	const live = (await Promise.all(rows.map(async (row) => withOptions(db(), row)))).filter((row) =>
		isLive(row, now),
	);

	return live.map((row) => ({
		id: row.id,
		name: row.name,
		segment: eventSegment(row.id, row.name),
		deletionDate: deletionDateOf(row),
		final: finalOf(row),
	}));
}
