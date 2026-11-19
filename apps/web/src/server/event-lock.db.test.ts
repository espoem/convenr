import { setTimeout as delay } from "node:timers/promises";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { removeEvent, removeParticipant, updateEvent } from "./manage";
import { changePassword, join, leave } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent } from "./test-events";

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

/** Waits until `count` other connections wait for a lock, checking every 25 ms for up to 30 seconds. */
async function untilWaitingForLocks(count: number, tries = 1200): Promise<void> {
	const waiting = await db().execute<{ count: number }>(
		sql`select count(*)::int as count from pg_stat_activity
			where datname = current_database() and wait_event_type = 'Lock'`,
	);

	if ((waiting.rows[0]?.count ?? 0) >= count) {
		return;
	}

	if (tries === 0) {
		throw new Error(`Fewer than ${count} connections waited for a lock.`);
	}

	await delay(25);
	await untilWaitingForLocks(count, tries - 1);
}

describe("the event lock", () => {
	it("is neither taken nor waited for by a wrong admin secret", async () => {
		expect(
			await answerWhileLocked(() =>
				updateEvent(eventId, "cva_wrong", { name: "Jiná" }, { kind: "any" }, creationTime),
			),
		).toEqual({ status: "denied" });
		expect(
			await answerWhileLocked(() =>
				removeParticipant(eventId, "cva_wrong", "abcdefghijkm", creationTime),
			),
		).toEqual({ status: "denied" });
		expect(await answerWhileLocked(() => removeEvent(eventId, "cva_wrong", creationTime))).toBe(
			false,
		);
	});

	it("is neither taken nor waited for by a wrong participant token", async () => {
		expect((await join(eventId, "Jana", undefined, creationTime)).ok).toBe(true);

		const notJoined = { ok: false, problem: "not_joined" };

		expect(
			await answerWhileLocked(() =>
				saveResponse(eventId, "cvp_wrong", { available: [] }, creationTime),
			),
		).toEqual(notJoined);
		expect(
			await answerWhileLocked(() =>
				changePassword(eventId, "cvp_wrong", { kind: "none" }, "heslo", creationTime),
			),
		).toEqual(notJoined);
		expect(await answerWhileLocked(() => leave(eventId, "cvp_wrong", creationTime))).toEqual(
			notJoined,
		);
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
					joined.token,
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
