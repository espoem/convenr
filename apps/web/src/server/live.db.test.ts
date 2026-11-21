import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { createEvent } from "./events";
import { type LiveChange, stopListening, watchEvent } from "./live";
import { bySecret, removeEvent, updateEvent } from "./manage";
import { join } from "./participants";
import { creationTime, pragueEvenings } from "./test-events";

/** The next change `watchEvent` hands over for event `id`, and the function that stops watching. */
async function nextChange(id: string) {
	const { promise: arrived, resolve } = Promise.withResolvers<LiveChange>();

	const unwatch = await watchEvent(id, { onChange: resolve, onFailure: () => {} });

	return { arrived, unwatch };
}

async function created() {
	const result = await createEvent(pragueEvenings, creationTime);

	if (!result.ok) {
		throw new Error("The test event is invalid.");
	}

	return { event: result.event, admin: bySecret(result.adminSecret) };
}

beforeEach(async () => {
	await db().delete(events);
});

afterAll(async () => {
	await stopListening();
});

describe("watchEvent", () => {
	it("hands over the new version when a participant joins", async () => {
		const { event } = await created();
		const { arrived, unwatch } = await nextChange(event.id);

		await join(event.id, "Jana", undefined, creationTime.add({ minutes: 1 }));

		expect(await arrived).toEqual({ kind: "version", version: event.version + 1n });
		unwatch();
	});

	it("hands over the version of an organizer's change and nothing of another event", async () => {
		const { event, admin } = await created();
		const other = await created();
		const { arrived, unwatch } = await nextChange(event.id);

		await join(other.event.id, "Petr", undefined, creationTime.add({ minutes: 1 }));
		await updateEvent(
			event.id,
			admin,
			{ ...pragueEvenings, name: "Renamed" },
			{ kind: "any" },
			creationTime.add({ minutes: 2 }),
		);

		expect(await arrived).toEqual({ kind: "version", version: event.version + 1n });
		unwatch();
	});

	it("says that the event is gone once it is deleted", async () => {
		const { event, admin } = await created();
		const { arrived, unwatch } = await nextChange(event.id);

		await removeEvent(event.id, admin, creationTime.add({ minutes: 1 }));

		expect(await arrived).toEqual({ kind: "gone" });
		unwatch();
	});
});
