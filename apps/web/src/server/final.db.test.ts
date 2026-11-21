import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events, usageCounts } from "@/db/schema";
import { asEventVersion } from "@/lib/event-version";

import { createEvent, type NewEvent, readEvent } from "./events";
import { clearFinal, pickFinal } from "./final";
import { bySecret, type Precondition, updateEvent } from "./manage";
import { creationTime, deletionDay, mondayEvenings, pragueEvenings } from "./test-events";

const later = Temporal.Instant.from("2027-03-02T12:00:00Z");

// 17:00 and 18:00 in Prague on 5 April 2027.
const FIVE = "2027-04-05T15:00:00Z";
const SIX = "2027-04-05T16:00:00Z";

async function managedEvent(input: NewEvent = pragueEvenings) {
	const created = await createEvent(input, creationTime);

	if (!created.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: created.event.id, secret: bySecret(created.adminSecret) };
}

async function versionOf(id: string) {
	return (await readEvent(id, later))?.version;
}

beforeEach(async () => {
	await db().delete(events);
	await db().delete(usageCounts);
});

describe("pickFinal and clearFinal", () => {
	it("picks, changes and clears the final time, counting picks and changes in the sequence", async () => {
		const { id, secret } = await managedEvent();
		const start = await versionOf(id);

		const picked = await pickFinal(id, secret, { slots: [SIX, FIVE] }, undefined, later);

		expect(picked).toMatchObject({
			status: "saved",
			event: {
				final: {
					kind: "chosen",
					start: Temporal.Instant.from(FIVE),
					end: Temporal.Instant.from("2027-04-05T17:00:00Z"),
					sequence: 1,
				},
				finalSlots: [FIVE, SIX],
			},
		});
		expect(await versionOf(id)).toBe((start ?? 0n) + 1n);

		// The same window again changes nothing.
		await pickFinal(id, secret, { slots: [FIVE, SIX] }, undefined, later);
		expect(await versionOf(id)).toBe((start ?? 0n) + 1n);

		await pickFinal(id, secret, { slots: [SIX] }, undefined, later);
		expect((await readEvent(id, later))?.final).toMatchObject({ kind: "chosen", sequence: 2 });

		expect(await clearFinal(id, secret, undefined, later)).toMatchObject({
			status: "saved",
			event: { final: { kind: "open", sequence: 2 }, finalSlots: [] },
		});
		expect(await versionOf(id)).toBe((start ?? 0n) + 3n);

		await clearFinal(id, secret, undefined, later);
		expect(await versionOf(id)).toBe((start ?? 0n) + 3n);

		await pickFinal(id, secret, { slots: [FIVE] }, undefined, later);
		expect((await readEvent(id, later))?.final).toMatchObject({ kind: "chosen", sequence: 3 });
	});

	it("refuses a wrong secret and a window that is not the event's", async () => {
		const { id, secret } = await managedEvent();

		expect(await pickFinal(id, bySecret("cva_wrong"), { slots: [FIVE] }, undefined, later)).toEqual(
			{
				status: "denied",
			},
		);
		expect(
			await pickFinal(id, secret, { slots: [FIVE, "2027-04-05T17:00:00Z"] }, undefined, later),
		).toEqual({ status: "invalid", problem: "final_not_in_event" });
	});

	it("refuses a change made for a version the event no longer has", async () => {
		const { id, secret } = await managedEvent();
		const stale: Precondition = { kind: "match", versions: [asEventVersion(99n)] };

		expect(await clearFinal(id, secret, stale, later)).toMatchObject({
			status: "changed",
		});
	});

	it("counts the time to the first final time once", async () => {
		const { id, secret } = await managedEvent();

		await pickFinal(id, secret, { slots: [FIVE] }, undefined, later);
		await pickFinal(id, secret, { slots: [SIX] }, undefined, later);

		expect(
			await db().select().from(usageCounts).where(eq(usageCounts.metric, "time_to_final")),
		).toEqual([{ day: "2027-03-02", metric: "time_to_final", bucket: 3, count: 1 }]);
	});

	it("keeps a weekday event until the retention after a final date beyond its deletion date", async () => {
		const { id, secret } = await managedEvent(mondayEvenings);

		await pickFinal(
			id,
			secret,
			{ slots: ["w3-1020"], date: Temporal.PlainDate.from("2027-12-01") },
			undefined,
			later,
		);

		expect(deletionDay(await readEvent(id, later))).toBe("2028-02-29");
	});
});

describe("narrowing an event with a final time", () => {
	it("asks for confirmation without anyone losing availability, then clears the final time", async () => {
		const { id, secret } = await managedEvent();

		await pickFinal(id, secret, { slots: [SIX] }, undefined, later);

		const narrowed = { ...pragueEvenings, dailyEnd: 18 * 60 };
		const asked = await updateEvent(id, secret, narrowed, { kind: "any" }, later);

		expect(asked).toMatchObject({ status: "confirm", losing: 0, clearsFinal: true });

		if (asked.status !== "confirm") {
			return;
		}

		const saved = await updateEvent(id, secret, narrowed, { kind: "any" }, later, {
			kind: "version",
			version: asked.version,
		});

		expect(saved).toMatchObject({
			status: "saved",
			event: { final: { kind: "open", sequence: 1 } },
		});
	});

	it("keeps the final time when the change leaves its slots", async () => {
		const { id, secret } = await managedEvent();

		await pickFinal(id, secret, { slots: [FIVE] }, undefined, later);

		expect(
			await updateEvent(
				id,
				secret,
				{ ...pragueEvenings, dailyEnd: 18 * 60 },
				{ kind: "any" },
				later,
			),
		).toMatchObject({ status: "saved", event: { final: { kind: "chosen" } } });
	});
});
