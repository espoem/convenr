// Shared input for the data access layer tests.
import { setTimeout as delay } from "node:timers/promises";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { authUsers, emailCounts, events, organizers, usageCounts } from "@/db/schema";
import type { Deletion } from "@/domain/retention";

import { createEvent, type GridEventInput, type NewEvent, type PollEventInput } from "./events";

export const creationTime = Temporal.Instant.from("2027-03-01T12:00:00Z");

export const pragueEvenings: GridEventInput = {
	kind: "grid",
	name: "Schůzka výboru 2027",
	description: "Kdy se sejdeme?\nV klubovně.",
	days: { mode: "range", first: "2027-04-05", last: "2027-04-06" },
	dailyStart: 17 * 60,
	dailyEnd: 19 * 60,
	slotLength: 60,
	referenceZone: "Europe/Prague",
	firstDayOfWeek: 1,
};

export const mondayEvenings: GridEventInput = {
	...pragueEvenings,
	days: { mode: "weekdays", weekdays: [1, 3] },
};

/** A poll of three evenings in April 2027, in Prague time. */
export const pragueOptions: PollEventInput = {
	kind: "poll",
	name: "Výběr večera",
	description: "",
	referenceZone: "Europe/Prague",
	options: [
		{ start: "2027-04-05T16:00:00Z", end: "2027-04-05T18:00:00Z" },
		{ start: "2027-04-07T16:00:00Z", end: "2027-04-07T18:00:00Z" },
		{ start: "2027-04-09T16:00:00Z", end: "2027-04-09T18:00:00Z" },
	],
};

/** Empties the test database and creates one event from `input`. Returns its id. */
export async function freshEvent(input: NewEvent = pragueEvenings): Promise<string> {
	await resetTestDatabase();

	const created = await createEvent(input, creationTime);

	if (!created.ok) {
		throw new Error(`The test event is invalid: ${JSON.stringify(created.problems)}`);
	}

	return created.event.id;
}

/** Clears every table that stores event, notification, or usage state between database tests. */
export async function resetTestDatabase(): Promise<void> {
	await db().delete(events);
	await db().delete(emailCounts);
	await db().delete(usageCounts);
	await db().delete(organizers);
}

/** Waits until `count` other connections wait for a lock, checking every 25 ms for up to 30 seconds. */
export async function untilWaitingForLocks(count = 1, tries = 1200): Promise<void> {
	const waiting = await db().execute<{ count: number }>(
		sql`select count(*)::int as count from pg_stat_activity
			where datname = current_database() and wait_event_type = 'Lock'`,
	);

	if ((waiting.rows[0]?.count ?? 0) >= count) {
		return;
	}

	if (tries === 0) {
		throw new Error(`Fewer than ${count} connections waited for a lock.`);
	}

	await delay(25);
	await untilWaitingForLocks(count, tries - 1);
}

/** The deletion date of an event view as `YYYY-MM-DD`, or `kept` while it is kept. */
export function deletionDay(view: { deletion: Deletion } | undefined): string | undefined {
	if (view === undefined) {
		return undefined;
	}

	return view.deletion.kind === "kept" ? "kept" : view.deletion.date.toString();
}

/** A new account, as signing in creates one; its id is unique, so tests need not clean up. */
export async function freshAccount(name: string): Promise<string> {
	const id = `${name}-${crypto.randomUUID()}`;

	await db()
		.insert(authUsers)
		.values({ id, email: `${id}@example.org` });

	return id;
}
