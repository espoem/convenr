import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authUsers, events } from "@/db/schema";
import { env } from "@/env";

import { keepingOf } from "./event-rows";
import { createEvent, readEvent } from "./events";
import { runMaintenance } from "./maintenance";
import { claimEvent, ownerView, releaseEvent, setKeeping } from "./ownership";
import type { Visitor } from "./session";
import { creationTime, deletionDay, freshAccount, pragueEvenings } from "./test-events";

// The range ends on 6 April 2027: without keeping, the event is deleted on 5 July and expires at
// 22:00 UTC that day.
const plannedExpiry = Temporal.Instant.from("2027-07-05T22:00:00Z");
const nextDay = creationTime.add({ hours: 24 });

// Turned off on 1 December 2027, long past the planned date: 90 days later is 29 February 2028,
// which ends at 23:00 UTC in Prague winter time.
const turnedOff = Temporal.Instant.from("2027-12-01T12:00:00Z");
const floorExpiry = Temporal.Instant.from("2028-02-29T23:00:00Z");
const justBefore = (instant: Temporal.Instant) => instant.subtract({ microseconds: 1 });

async function ownedEvent(accountId: string) {
	const result = await createEvent(pragueEvenings, creationTime, { kind: "account", accountId });

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: result.event.id, secret: result.adminSecret };
}

async function stored(id: string) {
	const [row] = await db()
		.select({ version: events.version, keptUntil: events.keptUntil, ownerId: events.ownerId })
		.from(events)
		.where(eq(events.id, id));

	return row;
}

/** The event's owner, keeping, version and deletion date, as a test compares them. */
async function endState(id: string) {
	const after = await stored(id);

	return {
		ownerId: after?.ownerId,
		keeping: keepingOf({ keptUntil: after?.keptUntil ?? null }).kind,
		version: after?.version,
		deletion: deletionDay(await readEvent(id, nextDay)),
	};
}

/** The state once the keeping ended with the owner: one change after the `kept` version. */
function endedAfter(kept: bigint | undefined) {
	return { ownerId: null, keeping: "ended", version: (kept ?? 0n) + 1n, deletion: "2027-07-05" };
}

/** A signed-in visitor of account `accountId`. */
function viewer(accountId: string): Visitor {
	return {
		kind: "signed_in",
		accountId,
		email: `${accountId}@example.org`,
		sessionId: "session",
		sessionCreatedAt: creationTime,
	};
}

async function purge(now: Temporal.Instant) {
	return runMaintenance(db().$client, env().RETENTION_DAYS, now.toString());
}

beforeEach(async () => {
	await db().delete(events);

	if (env().RETENTION_DAYS !== 90) {
		throw new Error("These tests expect the default retention of 90 days.");
	}
});

describe("keeping by the owner", () => {
	it("keeps the event past its planned date, and the purge leaves it", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);

		expect(await setKeeping(id, jana, true, nextDay)).toEqual({ status: "changed" });
		expect((await readEvent(id, nextDay))?.deletion).toEqual({ kind: "kept", by: "organizer" });
		expect(await purge(turnedOff)).toBe(0);
		expect(deletionDay(await readEvent(id, turnedOff))).toBe("kept");
	});

	it("is the owner's alone: another account and the admin secret cannot keep the event", async () => {
		const jana = await freshAccount("jana");
		const petr = await freshAccount("petr");
		const { id } = await ownedEvent(jana);

		expect(await setKeeping(id, petr, true, nextDay)).toEqual({ status: "not_owner" });
		expect((await stored(id))?.keptUntil).toBeNull();

		const unowned = await createEvent(pragueEvenings, creationTime);

		if (!unowned.ok) {
			throw new Error("The test event is invalid.");
		}

		expect(await setKeeping(unowned.event.id, petr, true, nextDay)).toEqual({
			status: "not_owner",
		});
		// An event without an owner cannot be kept even by a write that skips the checks.
		await expect(
			db().update(events).set({ keptUntil: "infinity" }).where(eq(events.id, unowned.event.id)),
		).rejects.toThrow("Failed query");
	});

	it("moves the version when it turns on or off, and not when it stays", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);
		const before = (await stored(id))?.version ?? 0n;

		await setKeeping(id, jana, true, nextDay);
		await setKeeping(id, jana, true, nextDay);
		expect((await stored(id))?.version).toBe(before + 1n);

		await setKeeping(id, jana, false, nextDay);
		expect((await stored(id))?.version).toBe(before + 2n);
	});

	it("tells an expired event apart from one the account does not own", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);

		expect(await setKeeping(id, jana, true, plannedExpiry)).toEqual({ status: "event_gone" });
		expect(await releaseEvent(id, jana, plannedExpiry)).toEqual({ status: "event_gone" });
	});

	it("shows the switch to the owner only, with its state", async () => {
		const jana = await freshAccount("jana");
		const petr = await freshAccount("petr");
		const { id } = await ownedEvent(jana);

		const view = async (accountId: string) => {
			const event = await readEvent(id, nextDay);

			if (event === undefined) {
				throw new Error("The test event is gone.");
			}

			return ownerView(viewer(accountId), event);
		};

		expect(await view(petr)).toEqual({ kind: "not_owner" });
		expect(await view(jana)).toEqual({
			kind: "owner",
			keeping: { kind: "shown", kept: false },
		});

		await setKeeping(id, jana, true, nextDay);
		expect(await view(jana)).toEqual({ kind: "owner", keeping: { kind: "shown", kept: true } });
	});
});

describe("when the keeping ends", () => {
	it("gives a full retention period from that day, and the purge agrees", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);

		await setKeeping(id, jana, true, nextDay);
		await setKeeping(id, jana, false, turnedOff);

		expect(deletionDay(await readEvent(id, turnedOff))).toBe("2028-02-29");
		expect(await readEvent(id, floorExpiry)).toBeUndefined();
		expect(await purge(justBefore(floorExpiry))).toBe(0);
		expect(await purge(floorExpiry)).toBe(1);
	});

	it("leaves the planned date when that is later", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);

		await setKeeping(id, jana, true, nextDay);
		await setKeeping(id, jana, false, nextDay.add({ hours: 24 }));

		expect(deletionDay(await readEvent(id, nextDay))).toBe("2027-07-05");
		expect(await purge(justBefore(plannedExpiry))).toBe(0);
		expect(await purge(plannedExpiry)).toBe(1);
	});

	// Both run through the trigger, which takes the database clock: a time before the test's
	// planned date, so the planned date stays.
	it("comes with releasing the event, and claiming it again does not bring it back", async () => {
		const jana = await freshAccount("jana");
		const { id, secret } = await ownedEvent(jana);

		await setKeeping(id, jana, true, nextDay);

		const kept = await stored(id);

		expect(await releaseEvent(id, jana, nextDay)).toEqual({ status: "changed" });
		expect(await endState(id)).toEqual(endedAfter(kept?.version));
		expect(await releaseEvent(id, jana, nextDay)).toEqual({ status: "not_owner" });

		expect(await claimEvent(id, secret, jana, nextDay)).toEqual({ status: "claimed" });
		expect(deletionDay(await readEvent(id, nextDay))).toBe("2027-07-05");
	});

	it("comes with deleting the account, and the event stays", async () => {
		const jana = await freshAccount("jana");
		const { id } = await ownedEvent(jana);

		await setKeeping(id, jana, true, nextDay);

		const kept = await stored(id);

		await db().delete(authUsers).where(eq(authUsers.id, jana));
		expect(await endState(id)).toEqual(endedAfter(kept?.version));
	});
});
