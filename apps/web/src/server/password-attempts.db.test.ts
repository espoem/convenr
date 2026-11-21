import { setTimeout as delay } from "node:timers/promises";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { participants } from "@/db/schema";

import { byToken } from "./event-rows";
import { changePassword, join, MAX_FAILED_ATTEMPTS } from "./participants";
import { verifyPassword } from "./password";
import { creationTime, freshEvent } from "./test-events";

// Password hashing is slow on purpose, and slower on a loaded machine.
const PASSWORD_TIMEOUT = 60_000;

let eventId = "";
let verifiedWrong = 0;

/** The real verification, counting each wrong password it checks. */
async function countedVerify(password: string, stored: string): Promise<boolean> {
	const right = await verifyPassword(password, stored);

	if (!right) {
		verifiedWrong += 1;
	}

	return right;
}

beforeEach(async () => {
	eventId = await freshEvent();
	verifiedWrong = 0;
});

function guess(password: string, at = creationTime, verify = countedVerify) {
	return join(eventId, "Jana", { kind: "current", password }, at, verify);
}

/** Guesses each password after the previous one was answered. */
async function guessInTurn(passwords: string[]): Promise<void> {
	const [first, ...rest] = passwords;

	if (first !== undefined) {
		await guess(first);
		await guessInTurn(rest);
	}
}

/** Resolves once `condition` holds, checking every 25 ms for up to five seconds. */
async function eventually(condition: () => Promise<boolean>, tries = 200): Promise<void> {
	if (await condition()) {
		return;
	}

	if (tries === 0) {
		throw new Error("The condition did not come true.");
	}

	await delay(25);
	await eventually(condition, tries - 1);
}

function problemsOf(results: Awaited<ReturnType<typeof join>>[]) {
	return results.map((result) => (result.ok ? "ok" : result.problem));
}

async function janaWithPassword(): Promise<string> {
	const created = await join(eventId, "Jana", { kind: "new", password: "tajne" }, creationTime);

	if (!created.ok) {
		throw new Error("Jana could not join.");
	}

	return created.token;
}

async function attemptsRow() {
	const [row] = await db()
		.select({ failedAttempts: participants.failedAttempts, lockedUntil: participants.lockedUntil })
		.from(participants);

	return row;
}

describe("parallel wrong passwords", () => {
	it(
		"verify at most five, and the right password after them is refused while locked",
		async () => {
			await janaWithPassword();

			const wrong = await Promise.all(
				Array.from({ length: 20 }, (_, attempt) => guess(`spatne${attempt}`)),
			);

			expect(verifiedWrong).toBe(MAX_FAILED_ATTEMPTS);

			const problems = problemsOf(wrong);

			expect(problems.filter((problem) => problem === "wrong_password")).toHaveLength(
				MAX_FAILED_ATTEMPTS - 1,
			);
			expect(problems.filter((problem) => problem === "too_many_attempts")).toHaveLength(
				20 - (MAX_FAILED_ATTEMPTS - 1),
			);

			const retryAt = creationTime.add({ minutes: 15 });

			expect(await guess("tajne", creationTime.add({ minutes: 1 }))).toEqual({
				ok: false,
				problem: "too_many_attempts",
				retryAt,
			});

			expect(await guess("tajne", retryAt)).toMatchObject({ ok: true });
			expect(await attemptsRow()).toMatchObject({ failedAttempts: 0 });
		},
		PASSWORD_TIMEOUT,
	);

	it(
		"keep their lockout when a right password checked alongside them succeeds",
		async () => {
			await janaWithPassword();

			const gate = Promise.withResolvers<void>();

			// The right password's check finishes only after the wrong ones locked the participant.
			const right = guess("tajne", creationTime, async (password, stored) => {
				await gate.promise;

				return countedVerify(password, stored);
			});

			await eventually(async () => (await attemptsRow())?.failedAttempts === 1);

			const wrong = await Promise.all(
				Array.from({ length: 10 }, (_, attempt) => guess(`spatne${attempt}`)),
			);

			gate.resolve();

			expect(await right).toMatchObject({ ok: true });
			// The right password was counted as a pending attempt, so four wrong ones reach the limit.
			expect(problemsOf(wrong).filter((problem) => problem === "wrong_password")).toHaveLength(
				MAX_FAILED_ATTEMPTS - 2,
			);

			const later = await Promise.all(
				Array.from({ length: 10 }, (_, attempt) =>
					guess(`jine${attempt}`, creationTime.add({ minutes: 1 })),
				),
			);

			expect(new Set(problemsOf(later))).toEqual(new Set(["too_many_attempts"]));
			expect(verifiedWrong).toBe(MAX_FAILED_ATTEMPTS - 1);
		},
		PASSWORD_TIMEOUT,
	);
});

describe("a right password", () => {
	it(
		"takes back only its own attempt, even the one that would have locked",
		async () => {
			await janaWithPassword();

			await guessInTurn(["spatne1", "spatne2", "spatne3", "spatne4"]);

			expect(await guess("tajne")).toMatchObject({ ok: true });
			expect(await attemptsRow()).toEqual({ failedAttempts: 4, lockedUntil: null });

			expect(await guess("spatne5")).toEqual({
				ok: false,
				problem: "too_many_attempts",
				retryAt: creationTime.add({ minutes: 15 }),
			});
		},
		PASSWORD_TIMEOUT,
	);
});

/** Waits until another connection waits for a row lock. */
async function untilSomeoneWaitsForALock() {
	await eventually(async () => {
		const waiting = await db().execute<{ count: number }>(
			sql`select count(*)::int as count from pg_stat_activity
				where datname = current_database() and wait_event_type = 'Lock'`,
		);

		return (waiting.rows[0]?.count ?? 0) > 0;
	});
}

/** What `call` answers when the participant is deleted while its password attempt waits. */
async function answerAfterDeletion<Answer>(call: () => Promise<Answer>): Promise<Answer> {
	let answer: Promise<Answer> | undefined;

	await db().transaction(async (tx) => {
		await tx.select({ id: participants.id }).from(participants).for("update");
		answer = call();
		await untilSomeoneWaitsForALock();
		await tx.delete(participants);
	});

	if (answer === undefined) {
		throw new Error("The call did not start.");
	}

	return answer;
}

describe("a participant deleted during a password attempt", () => {
	it(
		"is not joined for a password change",
		async () => {
			const token = await janaWithPassword();

			expect(
				await answerAfterDeletion(() =>
					changePassword(
						eventId,
						byToken(token),
						{ kind: "given", password: "tajne" },
						"nove-heslo",
						creationTime,
					),
				),
			).toEqual({ ok: false, problem: "not_joined" });
		},
		PASSWORD_TIMEOUT,
	);

	it(
		"frees the name for a join, which then finds nobody under it",
		async () => {
			await janaWithPassword();

			expect(await answerAfterDeletion(() => guess("tajne"))).toEqual({
				ok: false,
				problem: "name_unknown",
			});
		},
		PASSWORD_TIMEOUT,
	);
});
