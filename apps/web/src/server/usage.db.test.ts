import { asc, eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authUsers, events, organizers, usageCounts } from "@/db/schema";

import { createEvent, type NewEvent } from "./events";
import { pickFinal } from "./final";
import { runMaintenance } from "./maintenance";
import { bySecret, removeEvent } from "./manage";
import { claimEvent } from "./ownership";
import { join } from "./participants";
import { creationTime, freshAccount, mondayEvenings, pragueEvenings } from "./test-events";

const after = (hours: number) => creationTime.add({ hours });

async function created(input: NewEvent = pragueEvenings) {
	const result = await createEvent(input, creationTime);

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: result.event.id, admin: bySecret(result.adminSecret) };
}

async function joinAll(id: string, names: string[], at: Temporal.Instant) {
	await Promise.all(names.map((name) => join(id, name, undefined, at)));
}

async function maintain(now: Temporal.Instant) {
	return runMaintenance(db().$client, 90, now.toString());
}

/** Every count as `day metric bucket count`, in a stable order. */
async function counts(): Promise<string[]> {
	const rows = await db()
		.select()
		.from(usageCounts)
		.orderBy(asc(usageCounts.day), asc(usageCounts.metric), asc(usageCounts.bucket));

	return rows.map((row) => `${row.day} ${row.metric} ${row.bucket} ${row.count}`);
}

beforeEach(async () => {
	await db().delete(events);
	await db().delete(usageCounts);
	// Accounts of other test files stay, and their organizer rows would count here.
	await db().delete(organizers);
});

describe("usage counts", () => {
	it("count creations and the first response once per event", async () => {
		const { id } = await created();

		await created();
		await join(id, "Jana", undefined, after(2));
		await join(id, "Petr", undefined, after(30));

		expect(await counts()).toEqual([
			"2027-03-01 events_created 0 2",
			"2027-03-01 first_response 1 1",
		]);
	});

	it("count activation at 7 days and group size at 30 days, on the day reached", async () => {
		const { id } = await created();

		await joinAll(id, ["Jana", "Petr"], after(1));
		await db().delete(usageCounts);

		await maintain(after(7 * 24).subtract({ microseconds: 1 }));
		expect(await counts()).toEqual([]);

		// A run a day late counts on the day the event turned 7 days old.
		await maintain(after(8 * 24));
		await maintain(after(8 * 24));
		expect(await counts()).toEqual([
			"2027-03-08 activated 0 1",
			"2027-03-08 activation_evaluated 0 1",
		]);

		await maintain(after(30 * 24));
		expect(await counts()).toEqual([
			"2027-03-08 activated 0 1",
			"2027-03-08 activation_evaluated 0 1",
			"2027-03-31 group_size 2 1",
		]);
	});

	it("count an event the organizer deletes before the ages, and only what is left", async () => {
		const early = await created();
		const later = await created();

		await joinAll(early.id, ["Jana"], after(1));
		await joinAll(later.id, ["Jana", "Petr", "Klára"], after(1));
		await db().delete(usageCounts);

		await removeEvent(early.id, early.admin, after(24));
		await maintain(after(7 * 24));
		await removeEvent(later.id, later.admin, after(10 * 24));

		expect(await counts()).toEqual([
			"2027-03-02 activation_evaluated 0 1",
			"2027-03-02 group_size 1 1",
			"2027-03-08 activated 0 1",
			"2027-03-08 activation_evaluated 0 1",
			"2027-03-11 group_size 3 1",
		]);
	});

	it("count an expired event before the purge deletes it", async () => {
		// Expires at the end of 30 May 2027. One event is older than 30 days by then, the other
		// is made 2 days old so the purge deletes it before either age.
		await created(mondayEvenings);

		const young = await created(mondayEvenings);
		const expiry = Temporal.Instant.from("2027-05-30T22:00:00Z");

		await joinAll(young.id, ["Jana", "Petr"], after(1));
		await db()
			.update(events)
			.set({ createdAt: expiry.subtract({ hours: 48 }).toString() })
			.where(eq(events.id, young.id));
		await db().delete(usageCounts);

		expect(await maintain(expiry)).toBe(2);
		expect(await counts()).toEqual([
			"2027-03-08 activation_evaluated 0 1",
			"2027-03-31 group_size 0 1",
			"2027-05-30 activated 0 1",
			"2027-05-30 activation_evaluated 0 1",
			"2027-05-30 group_size 2 1",
		]);
	});

	it("count an event as finalized with its group size, if it has a final time then", async () => {
		const aged = await created();
		const deleted = await created();

		// A third event without a final time counts for group size only.
		await created();

		await pickFinal(aged.id, aged.admin, { slots: ["2027-04-05T15:00:00Z"] }, undefined, after(1));
		await pickFinal(
			deleted.id,
			deleted.admin,
			{ slots: ["2027-04-05T15:00:00Z"] },
			undefined,
			after(30),
		);
		await db().delete(usageCounts);

		await removeEvent(deleted.id, deleted.admin, after(48));
		await maintain(after(30 * 24));

		expect((await counts()).filter((line) => !line.includes("activat"))).toEqual([
			"2027-03-03 finalized 0 1",
			"2027-03-03 group_size 0 1",
			"2027-03-31 finalized 0 1",
			"2027-03-31 group_size 0 2",
		]);
	});
});

const days = (count: number) => creationTime.add({ hours: count * 24 });

/** An event that account `accountId` creates at `at`. */
async function owned(accountId: string, at: Temporal.Instant) {
	// Days of the week, so that an event created months later is still valid.
	const result = await createEvent(mondayEvenings, at, { kind: "account", accountId });

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return result.event.id;
}

async function organizerCounts() {
	return (await counts()).filter((line) => line.includes("organizers_"));
}

describe("account counts", () => {
	it("count each account on the day it was created", async () => {
		// Better Auth writes `created_at`; the global `Date` is not used in this code base.
		await db().execute(sql`insert into auth_users (id, email, created_at) values
			('first', 'first@example.org', ${creationTime.toString()}),
			('second', 'second@example.org', '2027-03-01T23:59:59Z')`);

		expect(await counts()).toEqual(["2027-03-01 accounts_created 0 2"]);
		await db()
			.delete(authUsers)
			.where(inArray(authUsers.id, ["first", "second"]));
	});

	it("count returning organizers once, 90 days after their first event was created", async () => {
		const returning = await freshAccount("returning");
		const once = await freshAccount("once");
		const claiming = await freshAccount("claiming");
		const gone = await freshAccount("gone");

		await owned(returning, creationTime);
		await owned(returning, days(30));
		await owned(once, creationTime);
		await owned(gone, creationTime);
		await owned(gone, days(1));

		// A claimed event counts from its creation, so it becomes the first event.
		await owned(claiming, days(40));

		const older = await createEvent(pragueEvenings, creationTime);

		if (!older.ok) {
			throw new Error("The test event is invalid.");
		}

		await claimEvent(older.event.id, older.adminSecret, claiming, days(41));
		await db().delete(authUsers).where(eq(authUsers.id, gone));

		await maintain(days(90).subtract({ seconds: 1 }));
		expect(await organizerCounts()).toEqual([]);

		await maintain(days(90));
		expect(await organizerCounts()).toEqual([
			"2027-05-30 organizers_evaluated 0 3",
			"2027-05-30 organizers_returned 0 2",
		]);

		// An event after the 90 days changes nothing, and nor does a later pass.
		await owned(once, days(100));
		await maintain(days(100));
		expect(await organizerCounts()).toEqual([
			"2027-05-30 organizers_evaluated 0 3",
			"2027-05-30 organizers_returned 0 2",
		]);
	});
});
