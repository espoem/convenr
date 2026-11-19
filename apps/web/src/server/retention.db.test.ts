import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events, participants } from "@/db/schema";
import { env } from "@/env";

import { createEvent, eventVersion, type NewEvent, readEvent } from "./events";
import { runMaintenance } from "./maintenance";
import { readManagedEvent, removeEvent, removeParticipant, updateEvent } from "./manage";
import { changePassword, identify, join, leave, readParticipant } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, mondayEvenings, pragueEvenings } from "./test-events";

// With the default 90 days: the range ends on 6 April 2027, so its deletion date is 5 July and
// it expires at midnight after it in Prague, 22:00 UTC in summer time. The weekday event last
// changed on 1 March, so its deletion date is 30 May.
const datedExpiry = Temporal.Instant.from("2027-07-05T22:00:00Z");
const weekdayExpiry = Temporal.Instant.from("2027-05-30T22:00:00Z");
const justBefore = (instant: Temporal.Instant) => instant.subtract({ microseconds: 1 });

async function created(input: NewEvent) {
	const result = await createEvent(input, creationTime);

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: result.event.id, adminSecret: result.adminSecret };
}

async function purge(now: Temporal.Instant) {
	return runMaintenance(db().$client, env().RETENTION_DAYS, now.toString());
}

async function count(table: string): Promise<number | undefined> {
	const result = await db().execute<{ total: number }>(
		sql`select count(*)::int as total from ${sql.identifier(table)}`,
	);

	return result.rows[0]?.total;
}

beforeEach(async () => {
	await db().delete(events);

	if (env().RETENTION_DAYS !== 90) {
		throw new Error("These tests expect the default retention of 90 days.");
	}
});

describe("expiry", () => {
	it("answers a change made just before expiry with the event it wrote", async () => {
		const { id, adminSecret } = await created(pragueEvenings);

		const result = await updateEvent(
			id,
			adminSecret,
			{ name: "Jiná" },
			{ kind: "any" },
			justBefore(datedExpiry),
		);

		// A read right after would find nothing, but the change happened and its answer says so.
		expect(result).toMatchObject({ status: "saved", event: { id, name: "Jiná" } });
		expect(await readEvent(id, datedExpiry)).toBeUndefined();
	});

	it("makes the event unknown to pages, actions and the version check at once", async () => {
		const { id, adminSecret } = await created(pragueEvenings);
		const jana = await join(id, "Jana", undefined, creationTime);

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		const before = justBefore(datedExpiry);

		expect(await readEvent(id, before)).toBeDefined();
		expect(await eventVersion(id, before)).not.toBeNull();

		expect(await readEvent(id, datedExpiry)).toBeUndefined();
		expect(await eventVersion(id, datedExpiry)).toBeNull();
		expect(await readManagedEvent(id, adminSecret, datedExpiry)).toBeUndefined();
		expect(await identify(id, jana.token, datedExpiry)).toBeUndefined();
		expect(await join(id, "Petr", undefined, datedExpiry)).toEqual({
			ok: false,
			problem: "not_found",
		});
	});

	it("refuses every action on an expired event before it reads a name, a token or a secret", async () => {
		const { id, adminSecret } = await created(pragueEvenings);
		const jana = await join(id, "Jana", { kind: "new", password: "heslo-1234" }, creationTime);

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		const notFound = { ok: false, problem: "not_found" };
		const notJoined = { ok: false, problem: "not_joined" };

		expect(await join(id, "Jana", undefined, datedExpiry)).toEqual(notFound);
		expect(await join(id, "Jana", { kind: "current", password: "spatne" }, datedExpiry)).toEqual(
			notFound,
		);
		expect(
			await join(id, "Jana", { kind: "current", password: "heslo-1234" }, datedExpiry),
		).toEqual(notFound);
		expect(await readParticipant(id, jana.token, datedExpiry)).toBeUndefined();
		expect(await saveResponse(id, jana.token, [], datedExpiry)).toEqual(notJoined);
		expect(
			await changePassword(
				id,
				jana.token,
				{ kind: "given", password: "heslo-1234" },
				null,
				datedExpiry,
			),
		).toEqual(notJoined);
		expect(await leave(id, jana.token, datedExpiry)).toEqual(notJoined);
		expect(
			await updateEvent(id, adminSecret, { name: "Jiná" }, { kind: "any" }, datedExpiry),
		).toEqual({
			status: "denied",
		});
		expect(await removeEvent(id, adminSecret, datedExpiry)).toBe(false);

		const janaId = (await readManagedEvent(id, adminSecret, creationTime))?.participants[0]?.id;

		expect(await removeParticipant(id, adminSecret, janaId ?? "", datedExpiry)).toEqual({
			status: "denied",
		});

		// No token was issued and no failed attempt was counted.
		expect(await count("participant_tokens")).toBe(1);
		expect(await count("participants")).toBe(1);

		const [row] = await db().select().from(participants);

		expect(row?.failedAttempts).toBe(0);
	});
});

describe("the purge", () => {
	it("deletes expired events with every row that belongs to them, and only those", async () => {
		const dated = await created(pragueEvenings);
		const weekly = await created(mondayEvenings);

		await join(dated.id, "Jana", { kind: "new", password: "heslo-1234" }, creationTime);

		expect(await purge(justBefore(weekdayExpiry))).toBe(0);
		expect(await purge(weekdayExpiry)).toBe(1);
		expect(await readEvent(weekly.id, creationTime)).toBeUndefined();
		expect(await readEvent(dated.id, creationTime)).toBeDefined();

		expect(await purge(justBefore(datedExpiry))).toBe(0);
		expect(await purge(datedExpiry)).toBe(1);

		const tables = ["events", "participants", "participant_tokens", "dated_availability"];

		expect(await Promise.all(tables.map((table) => count(table)))).toEqual([0, 0, 0, 0]);
	});

	it("deletes nothing the second time and nothing with never", async () => {
		await created(pragueEvenings);

		expect(await runMaintenance(db().$client, "never", datedExpiry.toString())).toBe(0);
		expect(await purge(datedExpiry)).toBe(1);
		expect(await purge(datedExpiry)).toBe(0);
	});

	it("agrees with the expiry the pages use, for chosen dates too", async () => {
		const { id } = await created({
			...pragueEvenings,
			days: { mode: "dates", dates: ["2027-04-20", "2027-04-05"] },
		});

		// 20 April plus 90 days is 19 July; it ends at 22:00 UTC.
		const expiry = Temporal.Instant.from("2027-07-19T22:00:00Z");

		expect(await readEvent(id, justBefore(expiry))).toBeDefined();
		expect(await readEvent(id, expiry)).toBeUndefined();
		expect(await purge(justBefore(expiry))).toBe(0);
		expect(await purge(expiry)).toBe(1);
	});
});
