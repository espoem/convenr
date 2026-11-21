// Events an account owns, and the account's lists of events. An account adds an event with its
// admin secret; from then on it manages the event from any browser where it is signed in, and
// the admin link keeps working.
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { events, participants } from "@/db/schema";
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

/** What the account is in an event of its lists: the owner, or a participant under a name. */
export type AccountRole = { kind: "organizer" } | { kind: "participant"; name: string };

/** An event in one of the account's lists. */
export type AccountEvent = {
	id: string;
	name: string;
	segment: string;
	deletionDate: Temporal.PlainDate | null;
	final: FinalTime;
	role: AccountRole;
};

/** The live events of `rows`, in their order, with the account's role in each. */
async function listed(
	rows: { event: typeof events.$inferSelect; role: AccountRole }[],
	now: Temporal.Instant,
): Promise<AccountEvent[]> {
	const read = await Promise.all(
		rows.map(async ({ event, role }) => ({ row: await withOptions(db(), event), role })),
	);

	return read
		.filter(({ row }) => isLive(row, now))
		.map(({ row, role }) => ({
			id: row.id,
			name: row.name,
			segment: eventSegment(row.id, row.name),
			deletionDate: deletionDateOf(row),
			final: finalOf(row),
			role,
		}));
}

/** The live events `accountId` owns, the most recently created first. */
export async function ownedEvents(
	accountId: string,
	now = Temporal.Now.instant(),
): Promise<AccountEvent[]> {
	const rows = await db()
		.select()
		.from(events)
		.where(eq(events.ownerId, accountId))
		.orderBy(desc(events.createdAt));

	return listed(
		rows.map((event) => ({ event, role: { kind: "organizer" } })),
		now,
	);
}

/** The live events where `accountId` has a linked participant, the most recently joined first. */
export async function joinedEvents(
	accountId: string,
	now = Temporal.Now.instant(),
): Promise<AccountEvent[]> {
	const rows = await db()
		.select({ event: events, name: participants.displayName })
		.from(participants)
		.innerJoin(events, eq(events.id, participants.eventId))
		.where(eq(participants.accountId, accountId))
		.orderBy(desc(participants.createdAt));

	return listed(
		rows.map(({ event, name }) => ({ event, role: { kind: "participant", name } })),
		now,
	);
}
