import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events, usageCounts } from "@/db/schema";

import { createEvent, type NewEvent } from "./events";
import { runMaintenance } from "./maintenance";
import { removeEvent } from "./manage";
import { join } from "./participants";
import { creationTime, mondayEvenings, pragueEvenings } from "./test-events";

const after = (hours: number) => creationTime.add({ hours });

async function created(input: NewEvent = pragueEvenings) {
	const result = await createEvent(input, creationTime);

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: result.event.id, adminSecret: result.adminSecret };
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

		await removeEvent(early.id, early.adminSecret, after(24));
		await maintain(after(7 * 24));
		await removeEvent(later.id, later.adminSecret, after(10 * 24));

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
});
