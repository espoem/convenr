import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { participants, participantTokens } from "@/db/schema";
import { isPublicId, newPublicId } from "@/domain/public-id";

import { readEvent } from "./events";
import {
	ATTEMPTS_KEPT,
	changePassword,
	identify,
	join,
	leave,
	MAX_PARTICIPANTS,
	readParticipant,
} from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent } from "./test-events";

let eventId = "";

beforeEach(async () => {
	eventId = await freshEvent();
});

/** The password of a name that already has one. */
function current(password: string) {
	return { kind: "current", password } as const;
}

async function tokenOf(name: string, password?: string): Promise<string> {
	const joined = await join(
		eventId,
		name,
		password === undefined ? undefined : { kind: "new", password },
		creationTime,
	);

	if (!joined.ok) {
		throw new Error(`${name} could not join: ${joined.problem}`);
	}

	return joined.token;
}

describe("joining", () => {
	it("creates a participant under the normalized name and gives a token", async () => {
		const joined = await join(eventId, "  Jana   Nováková ", undefined, creationTime);

		expect(joined.ok && joined.token).toMatch(/^cvp_[\w-]{43}$/u);

		const [row] = await db().select().from(participants);
		const shown = { id: row?.publicId, name: "Jana Nováková", available: [] };

		expect(isPublicId(row?.publicId ?? "")).toBe(true);
		expect((await readEvent(eventId))?.participants).toEqual([shown]);
		// The join answers with the participant it wrote, without reading them again.
		expect(joined).toMatchObject({ ok: true, participant: shown });
	});

	it("answers a join under a used name with that participant's saved availability", async () => {
		const token = await tokenOf("Jana");

		await saveResponse(eventId, token, ["2027-04-05T15:00:00Z"], creationTime);

		const again = await join(eventId, "jana", undefined, creationTime);

		expect(again).toMatchObject({
			ok: true,
			participant: { name: "Jana", available: ["2027-04-05T15:00:00Z"] },
		});
		expect(again.ok && again.participant).toEqual(
			(await readParticipant(eventId, token, creationTime))?.participant,
		);
	});

	it("reads the token's participant by public id with their response", async () => {
		const token = await tokenOf("Jana");

		await saveResponse(eventId, token, ["2027-04-05T15:00:00Z"], creationTime);

		const [row] = await db().select().from(participants);

		expect(await readParticipant(eventId, token)).toMatchObject({
			participant: { id: row?.publicId, name: "Jana", available: ["2027-04-05T15:00:00Z"] },
			schedule: { referenceZone: "Europe/Prague", slotLength: 60 },
		});
		expect(await readParticipant(eventId, `${token}x`)).toBeUndefined();
		expect(await readParticipant("abcdefghijkm", token)).toBeUndefined();
	});

	it("gives another token to the same participant for a used name without a password", async () => {
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
			problem: "password_required",
		});
		expect(await join(eventId, "jana", current("tajne"), creationTime)).toMatchObject({ ok: true });
	});

	it("refuses a new password for a used name and a current password for a new one", async () => {
		await tokenOf("Jana", "tajne");
		await tokenOf("Petr");

		expect(await join(eventId, "jana", { kind: "new", password: "jine" }, creationTime)).toEqual({
			ok: false,
			problem: "name_exists",
		});
		expect(await join(eventId, "Eva", current("tajne"), creationTime)).toEqual({
			ok: false,
			problem: "name_unknown",
		});
		expect(await join(eventId, "Petr", current("tajne"), creationTime)).toEqual({
			ok: false,
			problem: "no_password",
		});
		expect(await db().select().from(participants)).toHaveLength(2);
	});

	it("checks a used name's password or sets a new name's from the web form's one field", async () => {
		const either = { kind: "current_or_new", password: "tajne" } as const;

		expect(await join(eventId, "Jana", either, creationTime)).toMatchObject({ ok: true });
		expect(await join(eventId, "jana", either, creationTime)).toMatchObject({ ok: true });
		expect(
			await join(eventId, "jana", { ...either, password: "spatne" }, creationTime),
		).toMatchObject({ problem: "wrong_password" });
	});

	it("refuses an invalid name, a password of the wrong length and an unknown event", async () => {
		expect(await join(eventId, " \t ", undefined, creationTime)).toMatchObject({
			problem: "invalid_name",
		});
		expect(
			await join(eventId, "Jana", { kind: "new", password: "abc" }, creationTime),
		).toMatchObject({
			problem: "invalid_password",
		});
		expect(await join("abcdefghijkm", "Jana", undefined, creationTime)).toMatchObject({
			problem: "not_found",
		});
	});

	it("refuses participant 101", async () => {
		await db()
			.insert(participants)
			.values(
				Array.from({ length: MAX_PARTICIPANTS }, (_, index) => ({
					publicId: newPublicId(),
					eventId,
					displayName: `P${index}`,
					nameKey: `p${index}`,
				})),
			);

		expect(await join(eventId, "Jana", undefined, creationTime)).toEqual({
			ok: false,
			problem: "event_full",
		});
	});

	it("keeps one participant when the same new name joins twice at once", async () => {
		const results = await Promise.all([tokenOf("Jana"), tokenOf("jana")]);

		expect(new Set(results).size).toBe(2);
		expect(await db().select().from(participants)).toHaveLength(1);
	});
});

describe("failed attempts", () => {
	it("locks for 15 minutes after the fifth wrong password", async () => {
		await tokenOf("Jana", "tajne");

		// Sent at the same time, so every one of them must be counted.
		const wrong = await Promise.all(
			[1, 2, 3, 4].map((attempt) =>
				join(eventId, "Jana", current(`spatne${attempt}`), creationTime),
			),
		);

		expect(wrong.map((result) => !result.ok && result.problem)).toEqual(
			Array.from({ length: 4 }, () => "wrong_password"),
		);

		const retryAt = creationTime.add({ minutes: 15 });

		expect(await join(eventId, "Jana", current("spatne5"), creationTime)).toEqual({
			ok: false,
			problem: "too_many_attempts",
			retryAt,
		});
		// Even the right password is refused while locked.
		expect(
			await join(eventId, "Jana", current("tajne"), creationTime.add({ minutes: 14 })),
		).toMatchObject({
			problem: "too_many_attempts",
		});
		expect(await join(eventId, "Jana", current("tajne"), retryAt)).toMatchObject({ ok: true });
	});

	it("keeps counting the wrong passwords before a right one", async () => {
		await tokenOf("Jana", "tajne");
		await join(eventId, "Jana", current("spatne"), creationTime);
		await join(eventId, "Jana", current("tajne"), creationTime);

		const [row] = await db().select().from(participants);

		expect(row?.failedAttempts).toBe(1);
	});

	it("keeps the count for 15 minutes after the last wrong password", async () => {
		await tokenOf("Jana", "tajne");

		await Promise.all(
			[1, 2, 3].map((attempt) => join(eventId, "Jana", current(`spatne${attempt}`), creationTime)),
		);

		await join(eventId, "Jana", current("spatne4"), creationTime.add({ minutes: 10 }));

		// Kept 15 minutes after the last attempt, not the first.
		const kept = creationTime.add({ minutes: 10 }).add(ATTEMPTS_KEPT).subtract({ seconds: 1 });

		expect(await join(eventId, "Jana", current("spatne5"), kept)).toMatchObject({
			problem: "too_many_attempts",
		});
	});

	it("starts a new count when the last wrong password is 15 minutes old", async () => {
		await tokenOf("Jana", "tajne");

		await Promise.all(
			[1, 2, 3, 4].map((attempt) =>
				join(eventId, "Jana", current(`spatne${attempt}`), creationTime),
			),
		);

		expect(
			await join(eventId, "Jana", current("spatne5"), creationTime.add(ATTEMPTS_KEPT)),
		).toEqual({ ok: false, problem: "wrong_password" });

		const [row] = await db().select().from(participants);

		expect(row?.failedAttempts).toBe(1);
	});
});

const none = { kind: "none" } as const;

/** The current password a change names explicitly. */
function given(password: string) {
	return { kind: "given", password } as const;
}

describe("passwords", () => {
	it("sets a password with the token alone, then needs it to change or remove it", async () => {
		const token = await tokenOf("Jana");

		expect(await changePassword(eventId, token, none, "prvni", creationTime)).toEqual({
			ok: true,
		});
		expect(await changePassword(eventId, token, none, "druhe", creationTime)).toEqual({
			ok: false,
			problem: "password_required",
		});
		expect(await changePassword(eventId, token, given("prvni"), null, creationTime)).toEqual({
			ok: true,
		});
		expect(await identify(eventId, token)).toEqual({ name: "Jana", hasPassword: false });
	});

	it("refuses a token of another event and removing a password that does not exist", async () => {
		const token = await tokenOf("Jana");

		expect(await changePassword("abcdefghijkm", token, none, "heslo", creationTime)).toEqual({
			ok: false,
			problem: "not_joined",
		});
		expect(await changePassword(eventId, token, none, null, creationTime)).toEqual({
			ok: false,
			problem: "no_password",
		});
		// A current password names one that must exist, even when setting a first one.
		expect(await changePassword(eventId, token, given("tajne"), "heslo", creationTime)).toEqual({
			ok: false,
			problem: "no_password",
		});
	});

	it("sets the new password from the web panel after another browser removed the old one", async () => {
		const token = await tokenOf("Jana", "tajne");
		const other = await join(eventId, "Jana", current("tajne"), creationTime);

		if (!other.ok) {
			throw new Error("The second browser could not join.");
		}

		// The panel was opened while the password was set, so it still sends the old one.
		await changePassword(eventId, other.token, given("tajne"), null, creationTime);

		expect(
			await changePassword(
				eventId,
				token,
				{ kind: "if_set", password: "tajne" },
				"nove-heslo",
				creationTime,
			),
		).toEqual({ ok: true });
		expect(await identify(eventId, token)).toEqual({ name: "Jana", hasPassword: true });
	});

	it("still checks the web panel's current password while one is set", async () => {
		const token = await tokenOf("Jana", "tajne");

		expect(
			await changePassword(
				eventId,
				token,
				{ kind: "if_set", password: "spatne" },
				"nove-heslo",
				creationTime,
			),
		).toEqual({ ok: false, problem: "wrong_password" });
	});
});

describe("leaving", () => {
	it("removes the participant with the response and every token, and frees the name", async () => {
		const token = await tokenOf("Jana", "tajne");
		const other = await join(eventId, "Jana", current("tajne"), creationTime);

		await saveResponse(eventId, token, ["2027-04-05T15:00:00Z"], creationTime);

		expect(await leave(eventId, token, creationTime)).toEqual({ ok: true });
		expect(await db().select().from(participantTokens)).toEqual([]);
		expect(other.ok && (await identify(eventId, other.token))).toBeFalsy();
		expect(await join(eventId, "Jana", undefined, creationTime)).toMatchObject({ ok: true });

		const [row] = await db().select().from(participants).where(eq(participants.nameKey, "jana"));

		expect(row?.passwordHash).toBeNull();
	});
});
