import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { POST as oneClick } from "@/app/api/unsubscribe/route";
import { db } from "@/db/client";
import { authUsers, emailCounts, events, outboxEmails } from "@/db/schema";
import { env } from "@/env";

import { byToken } from "./event-rows";
import { createEvent } from "./events";
import { clearFinal, pickFinal } from "./final";
import type { Email } from "./mail";
import { bySecret } from "./manage";
import { eventChoices, queueDue, setAccountChoices, setEventChoice } from "./notifications";
import { deliverOutbox, type Send } from "./outbox";
import { join, joinLinked } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshAccount, pragueEvenings } from "./test-events";

// The mail server is the one thing replaced: what would go out is collected here.
const sent: Email[] = [];

const collect: Send = (email) => {
	sent.push(email);

	return Promise.resolve();
};

const deliver = (now: Temporal.Instant, send = collect) => deliverOutbox(now, send);

const none = { kind: "none" } as const;
const minute = (count: number) => creationTime.add({ minutes: count });

// 17:00 in Prague on 5 April 2027; its reminder is due 24 hours before.
const FIVE = "2027-04-05T15:00:00Z";
const reminderDue = Temporal.Instant.from("2027-04-04T15:00:00Z");

const ALL_ON = { responses: true, final: true, reminder: true };

async function ownedEvent(owner: string) {
	const created = await createEvent(pragueEvenings, creationTime, {
		kind: "account",
		accountId: owner,
	});

	if (!created.ok) {
		throw new Error("The test event is invalid.");
	}

	return { id: created.event.id, admin: bySecret(created.adminSecret) };
}

async function waiting() {
	return db()
		.select({ accountId: outboxEmails.accountId, message: outboxEmails.message })
		.from(outboxEmails)
		.orderBy(outboxEmails.id);
}

beforeEach(async () => {
	await db().delete(events);
	await db().delete(emailCounts);
	sent.length = 0;
});

describe("new responses", () => {
	it("tell the owner at once after a quiet interval and gather what follows", async () => {
		const owner = await freshAccount("owner");
		const { id } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);

		const jana = await join(id, "Jana", none, minute(1));

		expect(jana.ok).toBe(true);
		expect(await waiting()).toEqual([
			{ accountId: owner, message: { kind: "responses", names: ["Jana"] } },
		]);

		await deliver(minute(1));
		await join(id, "Petr", none, minute(2));

		if (jana.ok) {
			await saveResponse(id, byToken(jana.token), { available: [FIVE] }, minute(3));
		}

		// Petr and Jana wait until 60 minutes after the first email.
		expect(await waiting()).toEqual([]);
		await queueDue(minute(60));
		expect(await waiting()).toEqual([]);
		await queueDue(minute(61));

		const [digest] = await waiting();
		const names = digest?.message.kind === "responses" ? digest.message.names : [];

		expect(names.toSorted()).toEqual(["Jana", "Petr"]);
	});

	it("are not sent for the owner's own response, or when the kind is off for the event", async () => {
		const owner = await freshAccount("owner");
		const { id } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await joinLinked(id, "Organizátor", none, owner, minute(1));
		expect(await waiting()).toEqual([]);

		await setEventChoice(db(), owner, id, "responses", "off");
		expect(await eventChoices(owner, id)).toEqual([
			{ kind: "responses", choice: "off", general: true },
			{ kind: "final", choice: "account", general: true },
			{ kind: "reminder", choice: "account", general: true },
		]);
		await join(id, "Jana", none, minute(2));
		expect(await waiting()).toEqual([]);
	});
});

describe("the final time", () => {
	it("goes to linked participants with a calendar file, and a later change overtakes it", async () => {
		const owner = await freshAccount("owner");
		const jana = await freshAccount("jana");
		const { id, admin } = await ownedEvent(owner);

		await setAccountChoices(jana, ALL_ON);
		await joinLinked(id, "Jana", none, jana, minute(1));
		await pickFinal(id, admin, { slots: [FIVE] }, undefined, minute(2));
		await clearFinal(id, admin, undefined, minute(3));

		expect((await waiting()).map((row) => row.message)).toEqual([
			{
				kind: "final",
				final: { kind: "chosen", start: FIVE, end: "2027-04-05T16:00:00Z", sequence: 1 },
			},
			{ kind: "final", final: { kind: "open", sequence: 1 } },
		]);

		// Only the notice that it was cleared is still true.
		expect(await deliver(minute(4))).toBe(1);
		expect(sent.map((email) => email.attachments)).toEqual([undefined]);
		expect(sent[0]?.subject).toContain("Schůzka výboru 2027");
		expect(await waiting()).toEqual([]);

		await pickFinal(id, admin, { slots: [FIVE] }, undefined, minute(5));
		await deliver(minute(6));

		const email = sent[1];

		expect(email?.attachments?.[0]?.content).toContain("BEGIN:VCALENDAR");
		expect(email?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
		expect(email?.text).toContain(`${env().PUBLIC_URL}/e/`);
		expect(email?.text).not.toContain("cva_");
	});
});

describe("reminders", () => {
	it("are sent once by the first pass at or after the due time, to the owner and linked participants", async () => {
		const owner = await freshAccount("owner");
		const jana = await freshAccount("jana");
		const { id, admin } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await setAccountChoices(jana, ALL_ON);
		await joinLinked(id, "Jana", none, jana, minute(1));
		await pickFinal(id, admin, { slots: [FIVE] }, undefined, minute(2));
		await db().delete(outboxEmails);

		await queueDue(reminderDue.subtract({ seconds: 1 }));
		expect(await waiting()).toEqual([]);

		await queueDue(reminderDue);
		expect((await waiting()).map((row) => row.accountId).toSorted()).toEqual(
			[jana, owner].toSorted(),
		);

		await db().delete(outboxEmails);
		await queueDue(reminderDue.add({ hours: 1 }));
		expect(await waiting()).toEqual([]);
	});

	it("are not due for a final time picked less than the reminder hours ahead", async () => {
		const owner = await freshAccount("owner");
		const { id, admin } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await pickFinal(id, admin, { slots: [FIVE] }, undefined, reminderDue.add({ hours: 1 }));
		await queueDue(reminderDue.add({ hours: 2 }));

		expect(await waiting()).toEqual([]);
	});
});

describe("the outbox", () => {
	it("retries a failed email over more than a day, then deletes it", async () => {
		const owner = await freshAccount("owner");
		const { id } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await join(id, "Jana", none, minute(1));

		let tried = 0;

		const failing: Send = () => {
			tried += 1;

			return Promise.reject(new Error("The mail server is away."));
		};

		// The first attempt and one after each delay: 15 minutes, an hour, 6 hours and a day.
		const attempts = [0, 15, 75, 435, 1875].map((offset) => minute(1 + offset));

		// One attempt after another, as the passes come.
		await attempts.reduce(async (previous, at) => {
			await previous;
			await deliver(at.subtract({ seconds: 1 }), failing);
			await deliver(at, failing);
		}, Promise.resolve());

		expect(tried).toBe(5);
		expect(await waiting()).toEqual([]);
	});

	it("goes with the account that is deleted", async () => {
		const owner = await freshAccount("owner");
		const { id } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await join(id, "Jana", none, minute(1));
		await db().delete(authUsers).where(eq(authUsers.id, owner));

		expect(await waiting()).toEqual([]);
	});
});

describe("unsubscribing", () => {
	it("turns the kind off for the event with the link's value, and nothing else", async () => {
		const owner = await freshAccount("owner");
		const { id } = await ownedEvent(owner);

		await setAccountChoices(owner, ALL_ON);
		await join(id, "Jana", none, minute(1));
		await deliver(minute(1));

		const header = sent[0]?.headers?.["List-Unsubscribe"] ?? "";
		const url = header.slice(1, -1);

		expect((await oneClick(new Request(`${url}x`, { method: "POST" }))).status).toBe(400);
		expect((await oneClick(new Request(url, { method: "POST" }))).status).toBe(204);

		await join(id, "Petr", none, minute(120));
		expect(await waiting()).toEqual([]);
	});
});
