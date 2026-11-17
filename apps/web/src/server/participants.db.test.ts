import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { participants, participantTokens } from "@/db/schema";

import { readEvent } from "./events";
import { changePassword, identify, join, leave, MAX_PARTICIPANTS } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent } from "./test-events";

let eventId = "";

beforeEach(async () => {
	eventId = await freshEvent();
});

async function tokenOf(name: string, password?: string): Promise<string> {
	const joined = await join(eventId, name, password, creationTime);

	if (!joined.ok) {
		throw new Error(`${name} could not join: ${joined.problem}`);
	}

	return joined.token;
}

describe("P4 joining", () => {
	it("creates a participant under the normalized name and gives a token", async () => {
		const joined = await join(eventId, "  Jana   Nováková ", undefined, creationTime);

		expect(joined).toMatchObject({ ok: true, name: "Jana Nováková" });
		expect((await readEvent(eventId))?.participants).toEqual([
			{ name: "Jana Nováková", available: [] },
		]);
	});

	it("gives another token to the same participant for a used name without a password (P2, P8)", async () => {
		const first = await tokenOf("Jana");
		const second = await tokenOf(" JANA ");

		expect(second).not.toBe(first);
		expect(await identify(eventId, first)).toEqual({ name: "Jana", hasPassword: false });
		expect(await identify(eventId, second)).toEqual({ name: "Jana", hasPassword: false });
		expect(await db().select().from(participants)).toHaveLength(1);
	});

	it("asks for the password of a used name that has one, and gives a token for the right one", async () => {
		await tokenOf("Jana", "tajne");

		expect(await join(eventId, "jana", undefined, creationTime)).toEqual({
			ok: false,
			problem: "password-required",
		});
		expect(await join(eventId, "jana", "tajne", creationTime)).toMatchObject({ ok: true });
	});

	it("refuses an invalid name, a password of the wrong length and an unknown event", async () => {
		expect(await join(eventId, " \t ", undefined, creationTime)).toMatchObject({
			problem: "invalid-name",
		});
		expect(await join(eventId, "Jana", "abc", creationTime)).toMatchObject({
			problem: "invalid-password",
		});
		expect(await join("abcdefghijkm", "Jana", undefined, creationTime)).toMatchObject({
			problem: "not-found",
		});
	});

	it("refuses participant 101 (P3)", async () => {
		await db()
			.insert(participants)
			.values(
				Array.from({ length: MAX_PARTICIPANTS }, (_, index) => ({
					eventId,
					displayName: `P${index}`,
					nameKey: `p${index}`,
				})),
			);

		expect(await join(eventId, "Jana", undefined, creationTime)).toEqual({
			ok: false,
			problem: "full",
		});
	});

	it("keeps one participant when the same new name joins twice at once (P2)", async () => {
		const results = await Promise.all([tokenOf("Jana"), tokenOf("jana")]);

		expect(new Set(results).size).toBe(2);
		expect(await db().select().from(participants)).toHaveLength(1);
	});
});

describe("P7 failed attempts", () => {
	it("locks for 15 minutes after the fifth wrong password in a row", async () => {
		await tokenOf("Jana", "tajne");

		// Sent at the same time, so every one of them must be counted.
		const wrong = await Promise.all(
			[1, 2, 3, 4].map((attempt) => join(eventId, "Jana", `spatne${attempt}`, creationTime)),
		);

		expect(wrong.map((result) => !result.ok && result.problem)).toEqual(
			Array.from({ length: 4 }, () => "wrong-password"),
		);

		const retryAt = creationTime.add({ minutes: 15 });

		expect(await join(eventId, "Jana", "spatne5", creationTime)).toEqual({
			ok: false,
			problem: "locked",
			retryAt,
		});
		// Even the right password is refused while locked.
		expect(await join(eventId, "Jana", "tajne", creationTime.add({ minutes: 14 }))).toMatchObject({
			problem: "locked",
		});
		expect(await join(eventId, "Jana", "tajne", retryAt)).toMatchObject({ ok: true });
	});

	it("resets the count after a right password", async () => {
		await tokenOf("Jana", "tajne");
		await join(eventId, "Jana", "spatne", creationTime);
		await join(eventId, "Jana", "tajne", creationTime);

		const [row] = await db().select().from(participants);

		expect(row?.failedAttempts).toBe(0);
	});
});

describe("P6 passwords", () => {
	it("sets a password with the token alone, then needs it to change or remove it", async () => {
		const token = await tokenOf("Jana");

		expect(await changePassword(eventId, token, undefined, "prvni", creationTime)).toEqual({
			ok: true,
		});
		expect(await changePassword(eventId, token, undefined, "druhe", creationTime)).toEqual({
			ok: false,
			problem: "password-required",
		});
		expect(await changePassword(eventId, token, "prvni", null, creationTime)).toEqual({ ok: true });
		expect(await identify(eventId, token)).toEqual({ name: "Jana", hasPassword: false });
	});

	it("refuses a token of another event and removing a password that does not exist", async () => {
		const token = await tokenOf("Jana");

		expect(await changePassword("abcdefghijkm", token, undefined, "heslo", creationTime)).toEqual({
			ok: false,
			problem: "not-joined",
		});
		expect(await changePassword(eventId, token, undefined, null, creationTime)).toEqual({
			ok: false,
			problem: "no-password",
		});
	});
});

describe("P9 leaving", () => {
	it("removes the participant with the response and every token, and frees the name", async () => {
		const token = await tokenOf("Jana", "tajne");
		const other = await join(eventId, "Jana", "tajne", creationTime);

		await saveResponse(eventId, token, ["2027-04-05T15:00:00Z"], creationTime);

		expect(await leave(eventId, token, creationTime)).toEqual({ ok: true });
		expect(await db().select().from(participantTokens)).toEqual([]);
		expect(other.ok && (await identify(eventId, other.token))).toBeFalsy();
		expect(await join(eventId, "Jana", undefined, creationTime)).toMatchObject({ ok: true });

		const [row] = await db().select().from(participants).where(eq(participants.nameKey, "jana"));

		expect(row?.passwordHash).toBeNull();
	});
});
