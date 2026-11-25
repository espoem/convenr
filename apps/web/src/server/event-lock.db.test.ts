import { setTimeout as delay } from "node:timers/promises";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { byToken } from "./event-rows";
import { bySecret, removeEvent, removeParticipant, updateEvent } from "./manage";
import { changePassword, join, leave } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent, untilWaitingForLocks } from "./test-events";

let eventId = "";

beforeEach(async () => {
	eventId = await freshEvent();
});

/** What `call` answers while another transaction holds the event's row lock. */
async function answerWhileLocked<Answer>(
	call: () => Promise<Answer>,
): Promise<Answer | "waited for the lock"> {
	return db().transaction(async (tx) => {
		await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");

		// A call that waits for the lock does not answer before the transaction ends.
		return Promise.race([call(), delay(2000).then(() => "waited for the lock" as const)]);
	});
}

// Password hashing is slow on purpose, and slower on a loaded machine.
const PASSWORD_TIMEOUT = 60_000;

describe("the event lock", () => {
	it("is neither taken nor waited for by a wrong admin secret", async () => {
		expect(
			await answerWhileLocked(() =>
				updateEvent(
					eventId,
					bySecret("cva_wrong"),
					{ name: "Jiná" },
					{ kind: "any" },
					creationTime,
				),
			),
		).toEqual({ status: "denied" });
		expect(
			await answerWhileLocked(() =>
				removeParticipant(eventId, bySecret("cva_wrong"), "abcdefghijkm", creationTime),
			),
		).toEqual({ status: "denied" });
		expect(
			await answerWhileLocked(() => removeEvent(eventId, bySecret("cva_wrong"), creationTime)),
		).toBe(false);
	});

	it("is neither taken nor waited for by a wrong participant token", async () => {
		expect((await join(eventId, "Jana", undefined, creationTime)).ok).toBe(true);

		const notJoined = { ok: false, problem: "not_joined" };

		expect(
			await answerWhileLocked(() =>
				saveResponse(eventId, byToken("cvp_wrong"), { available: [] }, creationTime),
			),
		).toEqual(notJoined);
		expect(
			await answerWhileLocked(() =>
				changePassword(eventId, byToken("cvp_wrong"), { kind: "none" }, "heslo", creationTime),
			),
		).toEqual(notJoined);
		expect(
			await answerWhileLocked(() => leave(eventId, byToken("cvp_wrong"), creationTime)),
		).toEqual(notJoined);
	});

	it(
		"lets one of two password changes that checked the same password win, and checks the other again",
		async () => {
			const joined = await join(eventId, "Jana", { kind: "new", password: "tajne" }, creationTime);

			if (!joined.ok) {
				throw new Error("Jana could not join.");
			}

			const change = (next: string) =>
				changePassword(
					eventId,
					byToken(joined.token),
					{ kind: "given", password: "tajne" },
					next,
					creationTime,
				);

			// Both changes check the password before either can take the lock to write.
			const changes = await db().transaction(async (tx) => {
				await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");

				const started = [change("prvni-nove"), change("druhe-nove")];

				await untilWaitingForLocks(2);

				return started;
			});

			const results = await Promise.all(changes);

			expect(results).toContainEqual({ ok: true });
			expect(results).toContainEqual({ ok: false, problem: "wrong_password" });

			const winner = results[0]?.ok === true ? "prvni-nove" : "druhe-nove";

			expect(
				await join(eventId, "Jana", { kind: "current", password: winner }, creationTime),
			).toMatchObject({ ok: true });
		},
		PASSWORD_TIMEOUT,
	);
});
