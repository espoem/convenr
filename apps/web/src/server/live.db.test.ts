import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authUsers, events } from "@/db/schema";

import { createEvent } from "./events";
import { type LiveChange, stopListening, watchEvent } from "./live";
import { bySecret, removeEvent, updateEvent } from "./manage";
import { setKeeping } from "./ownership";
import { join } from "./participants";
import { creationTime, freshAccount, pragueEvenings } from "./test-events";

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

	it("hands over the new version when deleting the owner's account ends the keeping", async () => {
		const owner = await freshAccount("jana");

		const result = await createEvent(pragueEvenings, creationTime, {
			kind: "account",
			accountId: owner,
		});

		if (!result.ok) {
			throw new Error("The test event is invalid.");
		}

		const { id } = result.event;

		await setKeeping(id, owner, true, creationTime.add({ minutes: 1 }));

		// The keeping's own announcement may still be on its way, so wait for the version after it.
		const ended = result.event.version + 2n;
		const { promise: arrived, resolve } = Promise.withResolvers<LiveChange>();

		const unwatch = await watchEvent(id, {
			onChange: (change) => {
				if (change.kind === "version" && change.version === ended) {
					resolve(change);
				}
			},
			onFailure: () => {},
		});

		await db().delete(authUsers).where(eq(authUsers.id, owner));

		expect(await arrived).toEqual({ kind: "version", version: ended });
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
