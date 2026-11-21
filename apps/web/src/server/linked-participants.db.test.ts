import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authUsers, participants, participantTokens } from "@/db/schema";

import { byToken, type Holder } from "./event-rows";
import { joinedEvents } from "./ownership";
import { identify, join, joinLinked, linkHeld, readParticipant, unlink } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshAccount, freshEvent } from "./test-events";

const FIVE = "2027-04-05T15:00:00Z";
const none = { kind: "none" } as const;
const browserToken = "cvp_derived-from-the-browser-key-00000000000";

let eventId = "";

beforeEach(async () => {
	eventId = await freshEvent();
});

function asAccount(accountId: string): Holder {
	return { kind: "account", accountId };
}

async function linkedRow(name: string) {
	const [row] = await db()
		.select({ accountId: participants.accountId, failedAttempts: participants.failedAttempts })
		.from(participants)
		.where(eq(participants.nameKey, name));

	return row;
}

async function tokenOf(name: string, token = browserToken) {
	const joined = await join(eventId, name, none, creationTime, undefined, {
		kind: "browser",
		token,
	});

	if (!joined.ok) {
		throw new Error(`${name} could not join: ${joined.problem}`);
	}

	return joined.token;
}

describe("a signed-in join", () => {
	it("links the participant to the account and stores no token", async () => {
		const jana = await freshAccount("jana");

		expect(await joinLinked(eventId, "Jana", none, jana, creationTime)).toMatchObject({
			ok: true,
			participant: { name: "Jana" },
		});
		expect(await db().select().from(participantTokens)).toEqual([]);
		expect(await identify(eventId, asAccount(jana), creationTime)).toEqual({
			name: "Jana",
			hasPassword: false,
			linked: true,
		});

		await saveResponse(eventId, asAccount(jana), { available: [FIVE] }, creationTime);

		expect(
			(await readParticipant(eventId, asAccount(jana), creationTime))?.participant,
		).toMatchObject({ levels: { [FIVE]: "available" } });
	});

	it("links a used name whose password fits, and moves the link to the next name", async () => {
		const jana = await freshAccount("jana");

		await join(eventId, "Jana", { kind: "new", password: "tajne" }, creationTime);

		expect(await joinLinked(eventId, "Jana", none, jana, creationTime)).toMatchObject({
			problem: "password_required",
		});
		expect(
			await joinLinked(eventId, "Jana", { kind: "current", password: "tajne" }, jana, creationTime),
		).toMatchObject({ ok: true });
		expect((await linkedRow("jana"))?.accountId).toBe(jana);

		await joinLinked(eventId, "Petr", none, jana, creationTime);

		// An account is one participant of an event; the first stays as an ordinary one.
		expect((await linkedRow("jana"))?.accountId).toBeNull();
		expect((await linkedRow("petr"))?.accountId).toBe(jana);
	});

	it("is refused for a name linked to another account, before its password is tried", async () => {
		const jana = await freshAccount("jana");
		const petr = await freshAccount("petr");

		await joinLinked(eventId, "Jana", { kind: "new", password: "tajne" }, jana, creationTime);

		expect(
			await joinLinked(
				eventId,
				"Jana",
				{ kind: "current", password: "spatne" },
				petr,
				creationTime,
			),
		).toEqual({ ok: false, problem: "name_in_account" });
		expect(await linkedRow("jana")).toEqual({ accountId: jana, failedAttempts: 0 });
	});

	it("closes the name to every join outside the account, even with the right password", async () => {
		const jana = await freshAccount("jana");

		await joinLinked(eventId, "Jana", { kind: "new", password: "tajne" }, jana, creationTime);

		expect(
			await join(eventId, "Jana", { kind: "current", password: "tajne" }, creationTime),
		).toEqual({ ok: false, problem: "name_in_account" });
		expect(await join(eventId, "Jana", none, creationTime)).toEqual({
			ok: false,
			problem: "name_in_account",
		});
		expect(await db().select().from(participantTokens)).toEqual([]);
	});

	it("retires the tokens a used name had before it was linked", async () => {
		const jana = await freshAccount("jana");
		const token = await tokenOf("Jana");

		await joinLinked(eventId, "Jana", none, jana, creationTime);

		expect(await identify(eventId, byToken(token), creationTime)).toBeUndefined();
		expect(await db().select().from(participantTokens)).toEqual([]);
	});
});

describe("adding the browser's participant to the account", () => {
	it("links it and retires the browser's token", async () => {
		const jana = await freshAccount("jana");
		const token = await tokenOf("Jana");

		expect(await linkHeld(eventId, token, jana, creationTime)).toEqual({ status: "linked" });
		expect(await identify(eventId, byToken(token), creationTime)).toBeUndefined();
		expect(await identify(eventId, asAccount(jana), creationTime)).toMatchObject({ name: "Jana" });
		expect(await joinedEvents(jana, creationTime)).toMatchObject([
			{ id: eventId, role: { kind: "participant", name: "Jana" } },
		]);
	});

	it("changes nothing for an unknown token or a second name", async () => {
		const jana = await freshAccount("jana");

		expect(await linkHeld(eventId, "cvp_unknown", jana, creationTime)).toEqual({
			status: "not_joined",
		});

		await joinLinked(eventId, "Jana", none, jana, creationTime);

		const second = await tokenOf("Eva");

		expect(await linkHeld(eventId, second, jana, creationTime)).toEqual({
			status: "account_already_joined",
		});
		expect((await linkedRow("eva"))?.accountId).toBeNull();
	});
});

describe("unlinking", () => {
	it("keeps the participant and gives the browser a token for it", async () => {
		const jana = await freshAccount("jana");

		await joinLinked(eventId, "Jana", none, jana, creationTime);

		expect(await unlink(eventId, jana, browserToken, creationTime)).toBe(true);
		expect(await identify(eventId, asAccount(jana), creationTime)).toBeUndefined();
		expect(await identify(eventId, byToken(browserToken), creationTime)).toMatchObject({
			name: "Jana",
			linked: false,
		});
		expect(await joinedEvents(jana, creationTime)).toEqual([]);
		expect(await unlink(eventId, jana, browserToken, creationTime)).toBe(false);
	});
});

describe("deleting the account", () => {
	it("leaves an ordinary participant with its response", async () => {
		const jana = await freshAccount("jana");

		await joinLinked(eventId, "Jana", none, jana, creationTime);
		await saveResponse(eventId, asAccount(jana), { available: [FIVE] }, creationTime);
		await db().delete(authUsers).where(eq(authUsers.id, jana));

		expect(await linkedRow("jana")).toEqual({ accountId: null, failedAttempts: 0 });
	});
});
