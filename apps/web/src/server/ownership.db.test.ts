import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authUsers, events } from "@/db/schema";

import { createEvent, readEvent } from "./events";
import { type AdminAccess, bySecret, readManagedEvent, updateEvent } from "./manage";
import { claimEvent, ownedEvents, owns } from "./ownership";
import { creationTime, freshAccount, pragueEvenings, resetTestDatabase } from "./test-events";

const later = Temporal.Instant.from("2027-03-02T12:00:00Z");

async function organized(name = pragueEvenings.name, createdAt = creationTime) {
	const created = await createEvent({ ...pragueEvenings, name }, createdAt);

	if (!created.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: created.event.id, secret: created.adminSecret };
}

function asOwner(accountId: string): AdminAccess {
	return { kind: "owner", accountId };
}

beforeEach(async () => {
	await resetTestDatabase();
});

describe("an account that adds an event with its admin secret", () => {
	it("owns it and manages it without the secret, which keeps working", async () => {
		const jana = await freshAccount("jana");
		const { id, secret } = await organized();
		const version = (await readEvent(id, later))?.version;

		expect(await claimEvent(id, secret, jana, later)).toEqual({ status: "claimed" });
		expect(await owns(jana, id)).toBe(true);
		// Ownership is not something participants see.
		expect((await readEvent(id, later))?.version).toBe(version);

		const renamed = await updateEvent(id, asOwner(jana), { name: "Jiná" }, { kind: "any" }, later);

		expect(renamed.status).toBe("saved");
		expect(await readManagedEvent(id, bySecret(secret), later)).toMatchObject({ name: "Jiná" });
	});

	it("is the only owner: a second account is refused and nothing changes", async () => {
		const jana = await freshAccount("jana");
		const petr = await freshAccount("petr");
		const { id, secret } = await organized();

		await claimEvent(id, secret, jana, later);

		expect(await claimEvent(id, secret, jana, later)).toEqual({ status: "already_owned" });
		expect(await claimEvent(id, secret, petr, later)).toEqual({ status: "event_has_owner" });
		expect(await owns(jana, id)).toBe(true);
		expect(await readManagedEvent(id, asOwner(petr), later)).toBeUndefined();
	});

	it("needs the right secret", async () => {
		const jana = await freshAccount("jana");
		const { id, secret } = await organized();

		expect(await claimEvent(id, `${secret}x`, jana, later)).toEqual({
			status: "wrong_admin_secret",
		});
		expect(await claimEvent("abcdefghijkm", secret, jana, later)).toEqual({
			status: "wrong_admin_secret",
		});
		expect(await owns(jana, id)).toBe(false);
	});
});

describe("an event created by a signed-in organizer", () => {
	it("belongs to the account from the start", async () => {
		const jana = await freshAccount("jana");

		const created = await createEvent(pragueEvenings, creationTime, {
			kind: "account",
			accountId: jana,
		});

		expect(created.ok && (await owns(jana, created.event.id))).toBe(true);
	});
});

describe("the account's list", () => {
	it("holds its own live events, the newest first", async () => {
		const jana = await freshAccount("jana");
		const petr = await freshAccount("petr");
		const first = await organized("První", creationTime);
		const second = await organized("Druhá", creationTime.add({ minutes: 1 }));
		const other = await organized("Cizí", creationTime.add({ minutes: 2 }));

		await claimEvent(first.id, first.secret, jana, later);
		await claimEvent(second.id, second.secret, jana, later);
		await claimEvent(other.id, other.secret, petr, later);

		const listed = await ownedEvents(jana, later);

		expect(listed.map((event) => event.name)).toEqual(["Druhá", "První"]);
		expect(listed[0]).toMatchObject({ final: { kind: "open" } });
		expect(listed[0]?.deletion.kind).toBe("on");
		// After its deletion date an event is gone from the list as from everywhere else.
		expect(await ownedEvents(jana, creationTime.add({ hours: 24 * 150 }))).toEqual([]);
	});
});

describe("deleting the account", () => {
	it("leaves its events without an owner, managed by their admin link", async () => {
		const jana = await freshAccount("jana");
		const { id, secret } = await organized();

		await claimEvent(id, secret, jana, later);
		await db().delete(authUsers).where(eq(authUsers.id, jana));

		const [row] = await db()
			.select({ ownerId: events.ownerId })
			.from(events)
			.where(eq(events.id, id));

		expect(row?.ownerId).toBeNull();
		expect(await readManagedEvent(id, bySecret(secret), later)).toBeDefined();
	});
});
