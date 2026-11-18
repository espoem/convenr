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

		const { id, adminSecret } = created;

		expect(await eventVersion(id)).toBe(creationTime.toString());

		const jana = await join(id, "Jana", undefined, minute(1));
		const petr = await join(id, "Petr", undefined, minute(2));

		if (!jana.ok || !petr.ok) {
			throw new Error("The participants could not join.");
		}

		expect(await eventVersion(id)).toBe(minute(2).toString());

		await saveResponse(id, jana.token, ["2027-04-05T15:00:00Z"], minute(3));
		expect(await eventVersion(id)).toBe(minute(3).toString());

		await changePassword(id, jana.token, undefined, "heslo-1234", minute(4));
		expect(await eventVersion(id)).toBe(minute(4).toString());

		await leave(id, jana.token, minute(5));
		expect(await eventVersion(id)).toBe(minute(5).toString());

		await updateEvent(id, adminSecret, { ...pragueEvenings, name: "Jiná" }, null, minute(6));
		expect(await eventVersion(id)).toBe(minute(6).toString());

		const petrId = (await readManagedEvent(id, adminSecret))?.participants[0]?.id ?? "";

		await removeParticipant(id, adminSecret, petrId, minute(7));
		expect(await eventVersion(id)).toBe(minute(7).toString());

		await removeEvent(id, adminSecret);
		expect(await eventVersion(id)).toBeNull();
	});
});
