import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";
import { isPublicId } from "@/domain/public-id";
import { asEventVersion, type EventVersion } from "@/lib/event-version";

import { createEvent, type NewEvent, readEvent } from "./events";
import {
	type Confirmation,
	type Precondition,
	readManagedEvent,
	removeEvent,
	removeParticipant,
	updateEvent,
} from "./manage";
import { join } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, pragueEvenings } from "./test-events";

const later = Temporal.Instant.from("2027-03-02T12:00:00Z");

// 17:00 and 18:00 in Prague on 5 April 2027.
const FIVE = "2027-04-05T15:00:00Z";
const SIX = "2027-04-05T16:00:00Z";

async function managedEvent() {
	const created = await createEvent(pragueEvenings, creationTime);

	if (!created.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: created.event.id, secret: created.adminSecret };
}

async function respond(id: string, name: string, keys: string[]) {
	const joined = await join(id, name, undefined, creationTime);

	if (!joined.ok) {
		throw new Error(`${name} could not join.`);
	}

	await saveResponse(id, joined.token, { available: keys }, creationTime);

	return joined.token;
}

const narrowed: NewEvent = { ...pragueEvenings, dailyEnd: 18 * 60 };

const anyVersion: Precondition = { kind: "any" };

function seen(version: EventVersion): Precondition {
	return { kind: "match", versions: [version] };
}

function confirmedAt(version: EventVersion): Confirmation {
	return { kind: "version", version };
}

async function versionOf(id: string): Promise<EventVersion> {
	const event = await readEvent(id);

	if (event === undefined) {
		throw new Error("The test event is gone.");
	}

	return event.version;
}

beforeEach(async () => {
	await db().delete(events);
});

describe("readManagedEvent", () => {
	it("returns the editable fields only for the event's admin secret", async () => {
		const { id, secret } = await managedEvent();

		expect(await readManagedEvent(id, `${secret}x`)).toBeUndefined();
		expect(await readManagedEvent(id, secret)).toMatchObject({
			name: pragueEvenings.name,
			days: pragueEvenings.days,
			locked: false,
			participants: [],
		});
	});
});

describe("updateEvent", () => {
	it("refuses a wrong secret without changing anything", async () => {
		const { id } = await managedEvent();

		expect(
			await updateEvent(id, "wrong", { ...pragueEvenings, name: "Jiné" }, anyVersion, later),
		).toEqual({
			status: "denied",
		});
		expect((await readEvent(id))?.name).toBe(pragueEvenings.name);
	});

	it("renames the event and answers with the event as it was written", async () => {
		const { id, secret } = await managedEvent();
		const renamed = { ...pragueEvenings, name: "Zkouška" };
		const saved = await updateEvent(id, secret, renamed, anyVersion, later);

		expect(saved).toMatchObject({
			status: "saved",
			event: { id, name: "Zkouška", segment: `zkouska-${id}`, version: asEventVersion(2n) },
		});
		expect(saved).toEqual({ status: "saved", event: await readEvent(id) });
	});

	it("keeps the stored value of every field the change leaves out", async () => {
		const { id, secret } = await managedEvent();

		expect((await updateEvent(id, secret, { name: "Zkouška" }, anyVersion, later)).status).toBe(
			"saved",
		);
		expect((await updateEvent(id, secret, { dailyEnd: 20 * 60 }, anyVersion, later)).status).toBe(
			"saved",
		);
		expect(await readManagedEvent(id, secret)).toMatchObject({
			...pragueEvenings,
			name: "Zkouška",
			dailyEnd: 20 * 60,
		});
	});

	it("writes nothing for a change that keeps every value, so the version stays", async () => {
		const { id, secret } = await managedEvent();
		const version = await versionOf(id);

		expect(await updateEvent(id, secret, {}, anyVersion, later)).toMatchObject({
			status: "saved",
			event: { segment: `schuzka-vyboru-2027-${id}`, version },
		});
		expect(
			await updateEvent(
				id,
				secret,
				{ ...pragueEvenings, name: ` ${pragueEvenings.name} ` },
				anyVersion,
				later,
			),
		).toMatchObject({ status: "saved" });
		expect((await readEvent(id))?.version).toBe(version);
		expect(version).toBe(1n);
	});

	it("locks slot length, day mode and zone once a participant joined", async () => {
		const { id, secret } = await managedEvent();

		const shorter = await updateEvent(
			id,
			secret,
			{ ...pragueEvenings, slotLength: 30 },
			anyVersion,
			later,
		);

		expect(shorter.status).toBe("saved");

		await respond(id, "Jana", []);

		expect((await readManagedEvent(id, secret))?.locked).toBe(true);
		expect(await updateEvent(id, secret, pragueEvenings, anyVersion, later)).toEqual({
			status: "invalid",
			problems: [{ kind: "rule", code: "field_locked", path: ["slotLength"] }],
		});
	});

	it("asks to confirm how many participants lose availability, then removes it", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE, SIX]);
		await respond(id, "Petr", [SIX]);
		await respond(id, "Eva", [FIVE]);

		const version = await versionOf(id);
		const asked = { status: "confirm", losing: 2, clearsFinal: false, version };

		expect(await updateEvent(id, secret, narrowed, anyVersion, later)).toEqual(asked);

		// A confirmation of another version, and a precondition that matches, confirm nothing.
		expect(
			await updateEvent(
				id,
				secret,
				narrowed,
				anyVersion,
				later,
				confirmedAt(asEventVersion(version + 1000n)),
			),
		).toEqual(asked);
		expect(await updateEvent(id, secret, narrowed, seen(version), later)).toEqual(asked);

		const saved = await updateEvent(id, secret, narrowed, anyVersion, later, confirmedAt(version));
		const view = await readEvent(id);

		expect(saved).toEqual({ status: "saved", event: view });
		expect(view?.participants.map(({ name, levels }) => ({ name, levels }))).toEqual([
			{ name: "Jana", levels: { [FIVE]: "available" } },
			{ name: "Petr", levels: {} },
			{ name: "Eva", levels: { [FIVE]: "available" } },
		]);
		expect(view?.slots).not.toContain(SIX);
	});

	it("does not take a confirmation for another group of people with the same count", async () => {
		const { id, secret } = await managedEvent();
		const jana = await respond(id, "Jana", [SIX]);

		const petr = await respond(id, "Petr", []);
		const asked = await updateEvent(id, secret, narrowed, anyVersion, later);

		expect(asked).toMatchObject({ status: "confirm", losing: 1 });

		// Jana moves to a slot that stays and Petr takes her place in the removed one: one person
		// still loses availability, but not the one the organizer was shown.
		await saveResponse(id, jana, { available: [FIVE] }, later);
		await saveResponse(id, petr, { available: [SIX] }, later);

		if (asked.status !== "confirm") {
			throw new Error("The change was not asked to confirm.");
		}

		const stale = asked.version;

		expect(
			await updateEvent(id, secret, narrowed, anyVersion, later, confirmedAt(stale)),
		).toMatchObject({ status: "confirm", losing: 1 });
		expect((await readEvent(id))?.slots).toContain(SIX);
	});

	it("refuses a change for a version other than the current one, whatever the change does", async () => {
		const { id, secret } = await managedEvent();
		const version = await versionOf(id);

		await updateEvent(id, secret, { name: "Zkouška" }, anyVersion, later);

		const current = await versionOf(id);

		expect(await updateEvent(id, secret, { name: "Jiná" }, seen(version), later)).toMatchObject({
			status: "changed",
			version: current,
		});
		expect(
			await updateEvent(id, secret, { name: "Jiná" }, { kind: "match", versions: [] }, later),
		).toMatchObject({
			status: "changed",
		});
		expect((await readEvent(id))?.name).toBe("Zkouška");
		expect(await updateEvent(id, secret, { name: "Jiná" }, seen(current), later)).toMatchObject({
			status: "saved",
		});
	});

	it("needs no confirmation when nobody marked a removed slot", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE]);

		expect((await updateEvent(id, secret, narrowed, anyVersion, later)).status).toBe("saved");
	});

	it("makes a later save with a removed slot fail as a whole", async () => {
		const { id, secret } = await managedEvent();
		const token = await respond(id, "Jana", []);

		await updateEvent(id, secret, narrowed, anyVersion, later);

		expect(await saveResponse(id, token, { available: [FIVE, SIX] }, later)).toMatchObject({
			ok: false,
			problem: "unknown_slot",
		});
	});
});

describe("removeParticipant", () => {
	it("deletes the participant with their response and frees the name", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE]);

		const jana = (await readManagedEvent(id, secret))?.participants[0];

		// The page names a participant by the public id; the database key stays on the server.
		expect(isPublicId(jana?.id ?? "")).toBe(true);
		expect(await removeParticipant(id, "wrong", jana?.id ?? "", later)).toEqual({
			status: "denied",
		});
		expect(await removeParticipant(id, secret, jana?.id ?? "", later)).toEqual({
			status: "removed",
		});
		expect((await readEvent(id))?.participants).toEqual([]);
		expect((await join(id, "Jana", undefined, later)).ok).toBe(true);
	});

	it("tells a participant the event does not have from a wrong secret", async () => {
		const { id, secret } = await managedEvent();

		expect(await removeParticipant(id, secret, "Ab3dEf7hJk9m", later)).toEqual({
			status: "not_found",
		});
		expect(await removeParticipant("abcdefghijkm", secret, "Ab3dEf7hJk9m", later)).toEqual({
			status: "denied",
		});
	});
});

describe("removeEvent", () => {
	it("deletes the event and every row that belongs to it", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE]);

		expect(await removeEvent(id, "wrong")).toBe(false);
		expect(await removeEvent(id, secret)).toBe(true);
		expect(await readEvent(id)).toBeUndefined();

		const tables = ["events", "participants", "participant_tokens", "dated_availability"];

		const counts = await Promise.all(
			tables.map(async (table) => {
				const result = await db().execute<{ total: number }>(
					sql`select count(*)::int as total from ${sql.identifier(table)}`,
				);

				return result.rows[0]?.total;
			}),
		);

		expect(counts).toEqual([0, 0, 0, 0]);
	});
});
