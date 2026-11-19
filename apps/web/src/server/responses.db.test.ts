import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { participants } from "@/db/schema";

import { readEvent } from "./events";
import { join } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent, mondayEvenings } from "./test-events";

const FIVE = "2027-04-05T15:00:00Z";
const SIX = "2027-04-05T16:00:00Z";

async function joined(eventId: string): Promise<string> {
	const result = await join(eventId, "Jana", undefined, creationTime);

	if (!result.ok) {
		throw new Error(`Jana could not join: ${result.problem}`);
	}

	return result.token;
}

async function levels(eventId: string) {
	return (await readEvent(eventId))?.participants[0]?.levels;
}

describe("saveResponse", () => {
	it("replaces the stored response as a whole, and the later save wins", async () => {
		const eventId = await freshEvent();
		const token = await joined(eventId);

		await saveResponse(eventId, token, { available: [FIVE, SIX], ifNeedBe: [SIX] });
		await saveResponse(eventId, token, { available: ["2027-04-06T16:00:00Z"] });

		expect(await levels(eventId)).toEqual({ "2027-04-06T16:00:00Z": "available" });
	});

	it("stores each slot's level and answers with it", async () => {
		const eventId = await freshEvent();
		const token = await joined(eventId);

		expect(
			await saveResponse(eventId, token, { available: [FIVE, SIX], ifNeedBe: [SIX] }),
		).toMatchObject({
			ok: true,
			participant: { levels: { [FIVE]: "available", [SIX]: "if_need_be" } },
		});
		expect(await levels(eventId)).toEqual({ [FIVE]: "available", [SIX]: "if_need_be" });
	});

	it("keeps the stored levels when a save leaves out the if-need-be list", async () => {
		const eventId = await freshEvent();
		const token = await joined(eventId);

		await saveResponse(eventId, token, { available: [FIVE, SIX], ifNeedBe: [SIX] });
		await saveResponse(eventId, token, { available: [SIX, "2027-04-06T15:00:00Z"] });

		expect(await levels(eventId)).toEqual({
			[SIX]: "if_need_be",
			"2027-04-06T15:00:00Z": "available",
		});
	});

	it("refuses the whole save when one slot is not the event's", async () => {
		const eventId = await freshEvent();
		const token = await joined(eventId);

		await saveResponse(eventId, token, { available: [FIVE] });

		expect(
			await saveResponse(eventId, token, { available: [SIX, "2027-04-05T15:30:00Z"] }),
		).toEqual({ ok: false, problem: "unknown_slot", unknown: [1] });
		expect(await levels(eventId)).toEqual({ [FIVE]: "available" });
	});

	it("refuses the whole save when a slot at if need be is not marked", async () => {
		const eventId = await freshEvent();
		const token = await joined(eventId);

		await saveResponse(eventId, token, { available: [FIVE] });

		expect(await saveResponse(eventId, token, { available: [SIX], ifNeedBe: [SIX, FIVE] })).toEqual(
			{ ok: false, problem: "if_need_be_not_available", notAvailable: [1] },
		);
		expect(await levels(eventId)).toEqual({ [FIVE]: "available" });
	});

	it("stores weekday slots by day and minute, and counts duplicates once", async () => {
		const eventId = await freshEvent(mondayEvenings);
		const token = await joined(eventId);

		expect(
			await saveResponse(eventId, token, {
				available: ["w3-1080", "w1-1020", "w3-1080"],
				ifNeedBe: ["w1-1020"],
			}),
		).toMatchObject({
			ok: true,
			participant: { name: "Jana", levels: { "w3-1080": "available", "w1-1020": "if_need_be" } },
		});
		expect(await levels(eventId)).toEqual({ "w1-1020": "if_need_be", "w3-1080": "available" });
	});

	it("reads a row written without a level, as a release before levels writes it, as available", async () => {
		const eventId = await freshEvent(mondayEvenings);

		await joined(eventId);

		const [row] = await db().select({ id: participants.id }).from(participants);

		await db().execute(
			sql`insert into weekday_availability (participant_id, weekday, minute) values (${row?.id}, 1, 1020)`,
		);

		expect(await levels(eventId)).toEqual({ "w1-1020": "available" });
	});

	it("refuses a token that does not belong to the event", async () => {
		const eventId = await freshEvent();

		expect(await saveResponse(eventId, "not-a-token", { available: [] })).toEqual({
			ok: false,
			problem: "not_joined",
		});
	});
});
