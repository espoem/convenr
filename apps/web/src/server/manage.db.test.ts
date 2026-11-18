import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";
import { isPublicId } from "@/domain/public-id";

import { createEvent, type NewEvent, readEvent } from "./events";
import { readManagedEvent, removeEvent, removeParticipant, updateEvent } from "./manage";
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

	return { id: created.id, secret: created.adminSecret };
}

async function respond(id: string, name: string, keys: string[]) {
	const joined = await join(id, name, undefined, creationTime);

	if (!joined.ok) {
		throw new Error(`${name} could not join.`);
	}

	await saveResponse(id, joined.token, keys, creationTime);

	return joined.token;
}

const narrowed: NewEvent = { ...pragueEvenings, dailyEnd: 18 * 60 };

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
			await updateEvent(id, "wrong", { ...pragueEvenings, name: "Jiné" }, null, later),
		).toEqual({
			status: "denied",
		});
		expect((await readEvent(id))?.name).toBe(pragueEvenings.name);
	});

	it("renames the event and returns the new address segment", async () => {
		const { id, secret } = await managedEvent();
		const renamed = { ...pragueEvenings, name: "Zkouška" };

		expect(await updateEvent(id, secret, renamed, null, later)).toEqual({
			status: "saved",
			segment: `zkouska-${id}`,
		});
	});

	it("locks slot length, day mode and zone once a participant joined", async () => {
		const { id, secret } = await managedEvent();

		const shorter = await updateEvent(
			id,
			secret,
			{ ...pragueEvenings, slotLength: 30 },
			null,
			later,
		);

		expect(shorter.status).toBe("saved");

		await respond(id, "Jana", []);

		expect((await readManagedEvent(id, secret))?.locked).toBe(true);
		expect(await updateEvent(id, secret, pragueEvenings, null, later)).toEqual({
			status: "invalid",
			problems: [{ kind: "rule", code: "field_locked", path: ["slotLength"] }],
		});
	});

	it("asks to confirm how many participants lose availability, then removes it", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE, SIX]);
		await respond(id, "Petr", [SIX]);
		await respond(id, "Eva", [FIVE]);

		expect(await updateEvent(id, secret, narrowed, null, later)).toEqual({
			status: "confirm",
			losing: 2,
		});
		expect(await updateEvent(id, secret, narrowed, 1, later)).toEqual({
			status: "confirm",
			losing: 2,
		});
		expect((await updateEvent(id, secret, narrowed, 2, later)).status).toBe("saved");

		const view = await readEvent(id);

		expect(view?.participants).toEqual([
			{ name: "Jana", available: [FIVE] },
			{ name: "Petr", available: [] },
			{ name: "Eva", available: [FIVE] },
		]);
		expect(view?.slots).not.toContain(SIX);
	});

	it("needs no confirmation when nobody marked a removed slot", async () => {
		const { id, secret } = await managedEvent();

		await respond(id, "Jana", [FIVE]);

		expect((await updateEvent(id, secret, narrowed, null, later)).status).toBe("saved");
	});

	it("makes a later save with a removed slot fail as a whole", async () => {
		const { id, secret } = await managedEvent();
		const token = await respond(id, "Jana", []);

		await updateEvent(id, secret, narrowed, null, later);

		expect(await saveResponse(id, token, [FIVE, SIX], later)).toEqual({
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
		expect(await removeParticipant(id, "wrong", jana?.id ?? "", later)).toBe(false);
		expect(await removeParticipant(id, secret, jana?.id ?? "", later)).toBe(true);
		expect((await readEvent(id))?.participants).toEqual([]);
		expect((await join(id, "Jana", undefined, later)).ok).toBe(true);
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
