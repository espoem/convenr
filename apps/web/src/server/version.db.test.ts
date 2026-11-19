import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { createEvent, eventVersion } from "./events";
import { readManagedEvent, removeEvent, removeParticipant, updateEvent } from "./manage";
import { changePassword, join, leave } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, pragueEvenings } from "./test-events";

/** A distinct instant for each step, so each step's version can be told apart. */
function minute(count: number) {
	return creationTime.add({ minutes: count });
}

beforeEach(async () => {
	await db().delete(events);
});

describe("eventVersion", () => {
	it("moves forward with every change to the event, its participants or their responses", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { adminSecret } = created;
		const { id } = created.event;

		expect(await eventVersion(id)).toBe(creationTime.toString());

		const jana = await join(id, "Jana", undefined, minute(1));
		const petr = await join(id, "Petr", undefined, minute(2));

		if (!jana.ok || !petr.ok) {
			throw new Error("The participants could not join.");
		}

		expect(await eventVersion(id)).toBe(minute(2).toString());

		await saveResponse(id, jana.token, ["2027-04-05T15:00:00Z"], minute(3));
		expect(await eventVersion(id)).toBe(minute(3).toString());

		await changePassword(id, jana.token, { kind: "none" }, "heslo-1234", minute(4));
		expect(await eventVersion(id)).toBe(minute(4).toString());

		await leave(id, jana.token, minute(5));
		expect(await eventVersion(id)).toBe(minute(5).toString());

		await updateEvent(
			id,
			adminSecret,
			{ ...pragueEvenings, name: "Jiná" },
			{ kind: "any" },
			minute(6),
		);
		expect(await eventVersion(id)).toBe(minute(6).toString());

		const petrId = (await readManagedEvent(id, adminSecret))?.participants[0]?.id ?? "";

		await removeParticipant(id, adminSecret, petrId, minute(7));
		expect(await eventVersion(id)).toBe(minute(7).toString());

		await removeEvent(id, adminSecret);
		expect(await eventVersion(id)).toBeNull();
	});

	it("stays when a save holds the same slots, in any order, and moves when it holds others", async () => {
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

		expect(await saveResponse(id, jana.token, slots, minute(2))).toMatchObject({ ok: true });
		expect(
			await saveResponse(id, jana.token, [...slots.toReversed(), ...slots], minute(3)),
		).toMatchObject({ ok: true });
		expect(await eventVersion(id)).toBe(minute(2).toString());

		await saveResponse(id, jana.token, slots.slice(1), minute(4));
		expect(await eventVersion(id)).toBe(minute(4).toString());
	});

	it("moves strictly forward for changes at the same instant and for a late writer", async () => {
		const created = await createEvent(pragueEvenings, creationTime);

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		const { adminSecret } = created;
		const { id } = created.event;
		const versions: Temporal.Instant[] = [];

		async function record() {
			versions.push(Temporal.Instant.from((await eventVersion(id)) ?? ""));
		}

		await record();

		const jana = await join(id, "Jana", undefined, creationTime);

		if (!jana.ok) {
			throw new Error("Jana could not join.");
		}

		await record();
		await saveResponse(id, jana.token, ["2027-04-05T15:00:00Z"], creationTime);
		await record();
		await saveResponse(id, jana.token, [], creationTime);
		await record();
		// A writer whose clock was read before the changes above.
		await updateEvent(
			id,
			adminSecret,
			{ name: "Jiná" },
			{ kind: "any" },
			creationTime.subtract({ hours: 1 }),
		);
		await record();

		const steps = versions
			.slice(1)
			.map((version, index) => Temporal.Instant.compare(version, versions[index] ?? version));

		expect(steps).toEqual([1, 1, 1, 1]);
	});
});
