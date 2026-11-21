import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { byToken } from "./event-rows";
import { createEvent, eventVersion, readEvent } from "./events";
import { bySecret, readManagedEvent, removeEvent, removeParticipant, updateEvent } from "./manage";
import { changePassword, join, leave } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, deletionDay, mondayEvenings, pragueEvenings } from "./test-events";

/** A distinct instant for each step, so each step's change time can be told apart. */
function minute(count: number) {
	return creationTime.add({ minutes: count });
}

/** The version and the time of the last change as stored. */
async function stored(id: string) {
	const [row] = await db().select().from(events).where(eq(events.id, id));

	if (row === undefined) {
		throw new Error("The test event is gone.");
	}

	return { version: row.version, changedAt: Temporal.Instant.from(row.changedAt) };
}

beforeEach(async () => {
	await db().delete(events);
});

describe("eventVersion", () => {
	it("counts every change to the event, its participants or their responses", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const admin = bySecret(created.adminSecret);
		const { id } = created.event;

		expect(await eventVersion(id)).toBe(1n);

		const jana = await join(id, "Jana", undefined, minute(1));
		const petr = await join(id, "Petr", undefined, minute(2));

		if (!jana.ok || !petr.ok) {
			throw new Error("The participants could not join.");
		}

		expect(await eventVersion(id)).toBe(3n);

		await saveResponse(id, byToken(jana.token), { available: ["2027-04-05T15:00:00Z"] }, minute(3));
		expect(await eventVersion(id)).toBe(4n);

		await changePassword(id, byToken(jana.token), { kind: "none" }, "heslo-1234", minute(4));
		expect(await eventVersion(id)).toBe(5n);

		await leave(id, byToken(jana.token), minute(5));
		expect(await eventVersion(id)).toBe(6n);

		await updateEvent(id, admin, { ...pragueEvenings, name: "Jiná" }, { kind: "any" }, minute(6));
		expect(await eventVersion(id)).toBe(7n);

		const petrId = (await readManagedEvent(id, admin))?.participants[0]?.id ?? "";

		await removeParticipant(id, admin, petrId, minute(7));
		expect(await eventVersion(id)).toBe(8n);

		await removeEvent(id, admin);
		expect(await eventVersion(id)).toBeNull();
	});

	it("keeps the version and the change time when a save holds the same slots in any order", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { id } = created.event;
		const jana = await join(id, "Jana", undefined, minute(1));

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		const slots = ["2027-04-05T15:00:00Z", "2027-04-05T16:00:00Z"];

		expect(
			await saveResponse(id, byToken(jana.token), { available: slots }, minute(2)),
		).toMatchObject({
			ok: true,
		});

		const saved = await stored(id);

		expect(saved.version).toBe(3n);
		expect(
			await saveResponse(
				id,
				byToken(jana.token),
				{ available: [...slots.toReversed(), ...slots] },
				minute(3),
			),
		).toMatchObject({ ok: true });
		expect(await stored(id)).toEqual(saved);

		await saveResponse(id, byToken(jana.token), { available: slots.slice(1) }, minute(4));
		expect(await stored(id)).toEqual({ version: 4n, changedAt: minute(4) });
	});

	it("gives two changes at the same instant versions n and n+1", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { id } = created.event;
		const jana = await join(id, "Jana", undefined, creationTime);

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		const first = await stored(id);

		await saveResponse(
			id,
			byToken(jana.token),
			{ available: ["2027-04-05T15:00:00Z"] },
			creationTime,
		);

		const second = await stored(id);

		expect(second.version).toBe(first.version + 1n);
		expect(second.changedAt.equals(first.changedAt)).toBe(true);
	});

	it("is not moved by a writer whose clock was read before an earlier change", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { id } = created.event;

		const admin = bySecret(created.adminSecret);

		await updateEvent(id, admin, { name: "Jiná" }, { kind: "any" }, minute(5));
		await updateEvent(id, admin, { name: "Třetí" }, { kind: "any" }, minute(1));

		expect((await stored(id)).version).toBe(3n);
	});
});

describe("changed_at", () => {
	it("is the time of the last change, and a weekday event's deletion date counts from it", async () => {
		const created = await createEvent(mondayEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { id } = created.event;

		expect(deletionDay(await readEvent(id))).toBe("2027-05-30");

		const jana = await join(id, "Jana", undefined, creationTime.add({ hours: 24 * 10 }));

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		expect(await stored(id)).toEqual({
			version: 2n,
			changedAt: creationTime.add({ hours: 24 * 10 }),
		});
		expect(deletionDay(await readEvent(id))).toBe("2027-06-09");

		await saveResponse(
			id,
			byToken(jana.token),
			{ available: [] },
			creationTime.add({ hours: 24 * 20 }),
		);
		await saveResponse(
			id,
			byToken(jana.token),
			{ available: [] },
			creationTime.add({ hours: 24 * 30 }),
		);
		expect(deletionDay(await readEvent(id))).toBe("2027-06-09");
	});
});
