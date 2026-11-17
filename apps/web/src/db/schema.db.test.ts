import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "./client";
import {
	datedAvailability,
	events,
	participants,
	participantTokens,
	weekdayAvailability,
} from "./schema";

const database = db();

const rangeEvent = {
	id: "abcdefghijkm",
	name: "Schůzka výboru",
	dayMode: "range",
	rangeFirst: "2027-04-05",
	rangeLast: "2027-04-09",
	dailyStart: 17 * 60,
	dailyEnd: 21 * 60,
	slotLength: 30,
	referenceZone: "Europe/Prague",
	firstDayOfWeek: 1,
	adminSecretHash: "hash",
} satisfies typeof events.$inferInsert;

async function rowCount(table: string): Promise<number> {
	const result = await database.execute<{ count: number }>(
		sql`select count(*)::int as count from ${sql.identifier(table)}`,
	);

	return result.rows[0]?.count ?? 0;
}

async function addParticipant(nameKey: string): Promise<string> {
	const [row] = await database
		.insert(participants)
		.values({ eventId: rangeEvent.id, displayName: nameKey, nameKey })
		.returning({ id: participants.id });

	if (row === undefined) {
		throw new Error("The insert returned no row.");
	}

	return row.id;
}

beforeEach(async () => {
	// Deleting the events cascades to every other table.
	await database.delete(events);
	await database.insert(events).values(rangeEvent);
});

describe("database schema", () => {
	it("refuses a second participant whose name key is already used in the event (P2)", async () => {
		await addParticipant("jana");

		await expect(addParticipant("jana")).rejects.toMatchObject({
			cause: { constraint: "participants_event_name" },
		});
	});

	it("refuses days that do not match the day mode", async () => {
		await expect(
			database.insert(events).values({ ...rangeEvent, id: "abcdefghijkn", weekdays: [1] }),
		).rejects.toMatchObject({ cause: { constraint: "events_days_match_mode" } });
	});

	it("keeps a slot's UTC instant whatever zone the database session uses (ADR 0002)", async () => {
		const participantId = await addParticipant("jana");

		// A transaction keeps every statement on the connection whose zone was changed.
		const stored = await database.transaction(async (tx) => {
			await tx.execute(sql`set local time zone 'America/New_York'`);
			await tx
				.insert(datedAvailability)
				.values({ participantId, slotStart: "2027-04-05T15:00:00Z" });

			const [row] = await tx
				.select({ slotStart: datedAvailability.slotStart })
				.from(datedAvailability);

			return row?.slotStart ?? "";
		});

		expect(stored).toMatch(/-04$/u);
		expect(Temporal.Instant.from(stored).toString()).toBe("2027-04-05T15:00:00Z");
	});

	it("deletes participants, tokens and availability with their event (ADR 0003)", async () => {
		const participantId = await addParticipant("jana");

		await database.insert(participantTokens).values({ tokenHash: "token", participantId });
		await database.insert(datedAvailability).values({
			participantId,
			slotStart: "2027-04-05T15:00:00Z",
		});
		await database.insert(weekdayAvailability).values({ participantId, weekday: 1, minute: 0 });

		await database.delete(events).where(eq(events.id, rangeEvent.id));

		const tables = [
			"participants",
			"participant_tokens",
			"dated_availability",
			"weekday_availability",
		];

		expect(await Promise.all(tables.map((table) => rowCount(table)))).toEqual([0, 0, 0, 0]);
	});
});
