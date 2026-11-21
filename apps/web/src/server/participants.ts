// Joining, passwords and leaving.
import { and, count, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { participants, participantTokens } from "@/db/schema";
import { parseDisplayName } from "@/domain/display-name";
import { newPublicId } from "@/domain/public-id";

import {
	liveEvent,
	participantByToken,
	participantForChange,
	type ParticipantRead,
	participantRead,
	type Queries,
	scheduleOf,
	touchEvent,
} from "./event-rows";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";
import { hashSecret, newSecret } from "./secrets";
import { countFirstResponse } from "./usage";

export const MAX_PARTICIPANTS = 100;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT = Temporal.Duration.from({ minutes: 15 });

/** How long after its last attempt a count of wrong passwords is kept. */
export const ATTEMPTS_KEPT = Temporal.Duration.from({ minutes: 15 });

type ParticipantRow = typeof participants.$inferSelect;

export type PasswordRefusal =
	| { ok: false; problem: "password_required" | "wrong_password" }
	| { ok: false; problem: "too_many_attempts"; retryAt: Temporal.Instant };

/** What a person who joins says about a password. */
export type JoinPassword =
	/** No password: enough for a new name and for a name that has none. */
	| { kind: "none" }
	/** The password of a name that has one; a new name is refused. */
	| { kind: "current"; password: string }
	/** The password a new name gets; a name that is already used is refused. */
	| { kind: "new"; password: string }
	/** The web form's one field: checks a used name's password, or sets a new name's. */
	| { kind: "current_or_new"; password: string };

const NO_PASSWORD: JoinPassword = { kind: "none" };

export type PasswordVerifier = typeof verifyPassword;

export type JoinResult =
	/** The participant as the write left them, so an answer needs no second read. */
	| ({ ok: true; token: string } & ParticipantRead)
	| PasswordRefusal
	| {
			ok: false;
			problem:
				| "not_found"
				| "invalid_name"
				| "invalid_password"
				| "event_full"
				| "name_exists"
				| "name_unknown"
				| "no_password";
	  };

function isPasswordLength(password: string): boolean {
	return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

/**
 * Where a joining participant's token comes from: a new random one for an API client, or the
 * token a browser derives from its key (ADR 0008), which it already holds.
 */
export type TokenSource = { kind: "random" } | { kind: "browser"; token: string };

const RANDOM_TOKEN: TokenSource = { kind: "random" };

/**
 * Stores the token's hash for the participant. A browser's token for an event points at one
 * participant only, so a browser that joins under another name moves its token there.
 */
async function issueToken(
	queries: Queries,
	participantId: string,
	source: TokenSource,
): Promise<string> {
	const token = source.kind === "random" ? newSecret("participant") : source.token;

	await queries
		.insert(participantTokens)
		.values({ tokenHash: hashSecret(token), participantId })
		.onConflictDoUpdate({
			target: participantTokens.tokenHash,
			set: { participantId, createdAt: sql`now()` },
		});

	return token;
}

/** The end of the participant's lockout, or `undefined` when they are not locked at `now`. */
function lockedUntil(
	row: { lockedUntil: string | null },
	now: Temporal.Instant,
): Temporal.Instant | undefined {
	const until = row.lockedUntil === null ? undefined : Temporal.Instant.from(row.lockedUntil);

	return until !== undefined && Temporal.Instant.compare(now, until) < 0 ? until : undefined;
}

/**
 * A password attempt, counted as wrong until its password proves right.
 *
 * - `counted`: it raised the count. `lockEnd` is the end of the participant's last lockout as
 *   stored, which every new lockout replaces, so it tells whether the count was reset since.
 * - `locking`: it was the fifth and locked the participant until `lockEnd`, replacing
 *   `previousLockEnd`.
 * - `locked`: refused unchecked, because the participant is locked until `until`.
 * - `participant_gone`: the participant left or was deleted.
 */
type Attempt =
	| { kind: "counted"; lockEnd: string | null }
	| { kind: "locking"; lockEnd: string; previousLockEnd: string | null }
	| { kind: "locked"; until: Temporal.Instant }
	| { kind: "participant_gone" };

/**
 * Takes one of the participant's attempts in a single statement, before the slow verification,
 * so that parallel guesses cannot verify more than the limit allows. The attempt that makes the
 * fifth locks the participant for 15 minutes at once and starts the count again. A count whose
 * last attempt is 15 minutes old is forgotten, so old typos do not add up to a lockout.
 */
async function takeAttempt(participantId: string, now: Temporal.Instant): Promise<Attempt> {
	const forgetBefore = now.subtract(ATTEMPTS_KEPT).toString();
	const kept = sql`case when ${participants.lastAttemptAt} > ${forgetBefore}::timestamptz then ${participants.failedAttempts} else 0 end`;
	const last = sql`${kept} + 1 >= ${MAX_FAILED_ATTEMPTS}`;

	const [taken] = await db()
		.update(participants)
		.set({
			failedAttempts: sql`case when ${last} then 0 else ${kept} + 1 end`,
			lastAttemptAt: now.toString(),
			lockedUntil: sql`case when ${last} then ${now.add(LOCKOUT).toString()}::timestamptz else ${participants.lockedUntil} end`,
		})
		.where(
			and(
				eq(participants.id, participantId),
				or(isNull(participants.lockedUntil), lte(participants.lockedUntil, now.toString())),
			),
		)
		.returning({
			failedAttempts: participants.failedAttempts,
			// As text, so that the value compares equal when an undo names it again.
			lockEnd: sql<string | null>`${participants.lockedUntil}::text`,
			previousLockEnd: sql<string | null>`old.locked_until::text`,
		});

	if (taken !== undefined) {
		return taken.failedAttempts === 0 && taken.lockEnd !== null
			? { kind: "locking", lockEnd: taken.lockEnd, previousLockEnd: taken.previousLockEnd }
			: { kind: "counted", lockEnd: taken.lockEnd };
	}

	const [current] = await db()
		.select({ lockedUntil: participants.lockedUntil })
		.from(participants)
		.where(eq(participants.id, participantId));

	if (current === undefined) {
		return { kind: "participant_gone" };
	}

	const until = lockedUntil(current, now);

	// The lockout ended, or a right password undid the lockout its own attempt set, meanwhile.
	return until === undefined ? takeAttempt(participantId, now) : { kind: "locked", until };
}

/**
 * Takes back an attempt whose password proved right, and nothing else: wrong passwords counted
 * alongside it, and a lockout that other attempts set, stay. Each statement changes the row only
 * while no other lockout replaced the one the attempt saw.
 */
async function undoAttempt(
	participantId: string,
	attempt: Extract<Attempt, { kind: "counted" | "locking" }>,
) {
	if (attempt.kind === "counted") {
		await db()
			.update(participants)
			.set({ failedAttempts: sql`${participants.failedAttempts} - 1` })
			.where(
				and(
					eq(participants.id, participantId),
					sql`${participants.lockedUntil} is not distinct from ${attempt.lockEnd}::timestamptz`,
				),
			);

		return;
	}

	// Nobody can take an attempt while the lockout lasts, so the count before it is the limit less one.
	await db()
		.update(participants)
		.set({
			failedAttempts: MAX_FAILED_ATTEMPTS - 1,
			lockedUntil: sql`${attempt.previousLockEnd}::timestamptz`,
		})
		.where(
			and(
				eq(participants.id, participantId),
				sql`${participants.lockedUntil} = ${attempt.lockEnd}::timestamptz`,
			),
		);
}

/** A password check: passed, refused, or impossible because the participant left or was deleted. */
type PasswordCheck = { ok: true } | PasswordRefusal | { ok: false; problem: "participant_gone" };

/**
 * Checks `password` against the participant's stored hash: a locked participant is refused
 * without a check, and the fifth wrong password locks for 15 minutes.
 */
async function checkPassword(
	participant: ParticipantRow,
	password: string | undefined,
	now: Temporal.Instant,
	verify: PasswordVerifier = verifyPassword,
): Promise<PasswordCheck> {
	if (participant.passwordHash === null) {
		return { ok: true };
	}

	if (password === undefined) {
		const locked = lockedUntil(participant, now);

		return locked === undefined
			? { ok: false, problem: "password_required" }
			: { ok: false, problem: "too_many_attempts", retryAt: locked };
	}

	const attempt = await takeAttempt(participant.id, now);

	switch (attempt.kind) {
		case "participant_gone":
			return { ok: false, problem: "participant_gone" };
		case "locked":
			return { ok: false, problem: "too_many_attempts", retryAt: attempt.until };
		case "counted":
		case "locking":
			break;
	}

	if (await verify(password, participant.passwordHash)) {
		await undoAttempt(participant.id, attempt);

		return { ok: true };
	}

	return attempt.kind === "locking"
		? { ok: false, problem: "too_many_attempts", retryAt: now.add(LOCKOUT) }
		: { ok: false, problem: "wrong_password" };
}

async function participantByName(eventId: string, key: string) {
	const [found] = await db()
		.select()
		.from(participants)
		.where(and(eq(participants.eventId, eventId), eq(participants.nameKey, key)));

	return found;
}

/**
 * Joins an event under a display name. `verify` checks a password against its stored hash; a
 * test passes one that counts the checks.
 */
export async function join(
	eventId: string,
	rawName: string,
	password: JoinPassword = NO_PASSWORD,
	now = Temporal.Now.instant(),
	verify: PasswordVerifier = verifyPassword,
	source: TokenSource = RANDOM_TOKEN,
): Promise<JoinResult> {
	const name = parseDisplayName(rawName);

	if (!name.ok) {
		return { ok: false, problem: "invalid_name" };
	}

	// An expired event is unknown: no name in it is looked up and no password is tried.
	if ((await liveEvent(db(), eventId, now, "read")) === undefined) {
		return { ok: false, problem: "not_found" };
	}

	const existing = await participantByName(eventId, name.key);

	const joined =
		existing === undefined
			? await joinNew(eventId, name, password, now, source)
			: await joinExisting(eventId, existing, password, now, verify, source);

	// Another browser took or freed the name between the lookup and the lock.
	if (!joined.ok && joined.problem === "name_taken") {
		return join(eventId, rawName, password, now, verify, source);
	}

	return joined;
}

type NameTaken = { ok: false; problem: "name_taken" };

/** A token for a used name, issued under the event lock once the password fits. */
async function joinExisting(
	eventId: string,
	existing: ParticipantRow,
	password: JoinPassword,
	now: Temporal.Instant,
	verify: PasswordVerifier,
	source: TokenSource,
): Promise<JoinResult | NameTaken> {
	if (password.kind === "new") {
		return { ok: false, problem: "name_exists" };
	}

	if (password.kind === "current" && existing.passwordHash === null) {
		return { ok: false, problem: "no_password" };
	}

	const given = password.kind === "none" ? undefined : password.password;
	const checked = await checkPassword(existing, given, now, verify);

	if (!checked.ok) {
		// The participant left, so the name is free again and the join starts over.
		return checked.problem === "participant_gone" ? { ok: false, problem: "name_taken" } : checked;
	}

	return db().transaction(async (tx): Promise<JoinResult | NameTaken> => {
		// The event may have expired or been deleted, or the participant left, while the
		// password was checked.
		const event = await liveEvent(tx, eventId, now, "lock");

		if (event === undefined) {
			return { ok: false, problem: "not_found" };
		}

		const [still] = await tx
			.select({ id: participants.id })
			.from(participants)
			.where(eq(participants.id, existing.id));

		if (still === undefined) {
			return { ok: false, problem: "name_taken" };
		}

		return {
			ok: true,
			token: await issueToken(tx, existing.id, source),
			...(await participantRead(tx, event, existing)),
		};
	});
}

/** A new participant under a name nobody in the event uses. */
async function joinNew(
	eventId: string,
	name: { name: string; key: string },
	password: JoinPassword,
	now: Temporal.Instant,
	source: TokenSource,
): Promise<JoinResult | NameTaken> {
	if (password.kind === "current") {
		return { ok: false, problem: "name_unknown" };
	}

	const chosen = password.kind === "none" ? undefined : password.password;

	if (chosen !== undefined && !isPasswordLength(chosen)) {
		return { ok: false, problem: "invalid_password" };
	}

	// Hashing takes a while, so it happens before the event row is locked.
	const passwordHash = chosen === undefined ? null : await hashPassword(chosen);

	return db().transaction(async (tx) => {
		// The lock orders joins of one event, so the participant limit and the name check hold.
		const event = await liveEvent(tx, eventId, now, "lock");

		if (event === undefined) {
			return { ok: false, problem: "not_found" } as const;
		}

		const [taken] = await tx
			.select({ id: participants.id })
			.from(participants)
			.where(and(eq(participants.eventId, eventId), eq(participants.nameKey, name.key)));

		if (taken !== undefined) {
			return { ok: false, problem: "name_taken" } as const;
		}

		const [total] = await tx
			.select({ value: count() })
			.from(participants)
			.where(eq(participants.eventId, eventId));

		if ((total?.value ?? 0) >= MAX_PARTICIPANTS) {
			return { ok: false, problem: "event_full" } as const;
		}

		const [row] = await tx
			.insert(participants)
			.values({
				// About 70 random bits make a collision negligible; the unique constraint would refuse one.
				publicId: newPublicId(),
				eventId,
				displayName: name.name,
				nameKey: name.key,
				passwordHash,
				createdAt: now.toString(),
			})
			.returning({ id: participants.id, publicId: participants.publicId });

		if (row === undefined) {
			throw new Error("The participant insert returned no row.");
		}

		await touchEvent(tx, event, now);
		await countFirstResponse(tx, event, now);

		return {
			ok: true,
			token: await issueToken(tx, row.id, source),
			participant: { id: row.publicId, name: name.name, levels: {} },
			schedule: scheduleOf(event),
		} as const;
	});
}

/** The name the holder of `token` joined `eventId` under, so a stored token reopens the event already joined. */
export async function identify(eventId: string, token: string, now = Temporal.Now.instant()) {
	const found = await participantByToken(db(), eventId, token, now);

	return found === undefined
		? undefined
		: { name: found.participant.displayName, hasPassword: found.participant.passwordHash !== null };
}

/**
 * Moves a participant from a token a browser kept in local storage before ADR 0008 to the token
 * it derives from its key, and retires the old token, which then exists nowhere else. Returns
 * what `identify` returns for the participant, or `undefined` when the old token is unknown.
 */
export async function moveToken(
	eventId: string,
	oldToken: string,
	browserToken: string,
	now = Temporal.Now.instant(),
): Promise<{ name: string; hasPassword: boolean } | undefined> {
	return db().transaction(async (tx) => {
		const found = await participantByToken(tx, eventId, oldToken, now);

		if (found === undefined) {
			return;
		}

		await issueToken(tx, found.participant.id, { kind: "browser", token: browserToken });

		if (oldToken !== browserToken) {
			await tx
				.delete(participantTokens)
				.where(eq(participantTokens.tokenHash, hashSecret(oldToken)));
		}

		return {
			name: found.participant.displayName,
			hasPassword: found.participant.passwordHash !== null,
		};
	});
}

/** Removes one token, so its browser no longer opens the event joined; the participant stays. */
export async function forgetToken(eventId: string, token: string, now = Temporal.Now.instant()) {
	const found = await participantByToken(db(), eventId, token, now);

	if (found !== undefined) {
		await db()
			.delete(participantTokens)
			.where(eq(participantTokens.tokenHash, hashSecret(token)));
	}
}

/** The participant that holds `token` in `eventId` as the event shows them, or `undefined`. */
export async function readParticipant(
	eventId: string,
	token: string,
	now = Temporal.Now.instant(),
): Promise<ParticipantRead | undefined> {
	const found = await participantByToken(db(), eventId, token, now);

	return found === undefined ? undefined : participantRead(db(), found.event, found.participant);
}

export type PasswordChangeResult =
	| { ok: true }
	| PasswordRefusal
	| { ok: false; problem: "not_joined" | "invalid_password" | "no_password" };

/** What a password change says about the password the participant already has. */
export type CurrentPassword =
	/** None: enough while no password is set. */
	| { kind: "none" }
	/** The password that is set; refused with `no_password` when none is. */
	| { kind: "given"; password: string }
	/**
	 * The web panel's field: checked when a password is set and ignored when none is, because
	 * the panel asks to set the new password whatever another browser did meanwhile.
	 */
	| { kind: "if_set"; password: string };

/**
 * Sets, changes or removes (`next` is `null`) the password of the token's participant.
 * Changing or removing a stored password needs the current one.
 */
export async function changePassword(
	eventId: string,
	token: string,
	current: CurrentPassword,
	next: string | null,
	now = Temporal.Now.instant(),
): Promise<PasswordChangeResult> {
	const found = await participantByToken(db(), eventId, token, now);

	if (found === undefined) {
		return { ok: false, problem: "not_joined" };
	}

	// Removing a password, or naming a current one, needs a stored password.
	if ((next === null || current.kind === "given") && found.participant.passwordHash === null) {
		return { ok: false, problem: "no_password" };
	}

	if (next !== null && !isPasswordLength(next)) {
		return { ok: false, problem: "invalid_password" };
	}

	const given = current.kind === "none" ? undefined : current.password;
	const checked = await checkPassword(found.participant, given, now);

	if (!checked.ok) {
		// A participant who left or was deleted meanwhile is as unknown as their token.
		return checked.problem === "participant_gone" ? { ok: false, problem: "not_joined" } : checked;
	}

	const passwordHash = next === null ? null : await hashPassword(next);
	const checkedHash = found.participant.passwordHash;

	const written = await db().transaction(
		async (tx): Promise<PasswordChangeResult | { ok: false; problem: "password_replaced" }> => {
			// The participant may have left, or the event expired, while the password was hashed.
			const locked = await participantForChange(tx, eventId, token, now);

			if (locked === undefined) {
				return { ok: false, problem: "not_joined" };
			}

			const [changed] = await tx
				.update(participants)
				.set({ passwordHash })
				.where(
					and(
						eq(participants.id, locked.participant.id),
						sql`${participants.passwordHash} is not distinct from ${checkedHash}`,
					),
				)
				.returning({ id: participants.id });

			if (changed === undefined) {
				return { ok: false, problem: "password_replaced" };
			}

			await touchEvent(tx, locked.event, now);

			return { ok: true };
		},
	);

	// Another change replaced the password after this one checked it: check against the new one.
	return !written.ok && written.problem === "password_replaced"
		? changePassword(eventId, token, current, next, now)
		: written;
}

/** Deletes the token's participant with its response, password and tokens. */
export async function leave(eventId: string, token: string, now = Temporal.Now.instant()) {
	return db().transaction(async (tx) => {
		const found = await participantForChange(tx, eventId, token, now);

		if (found === undefined) {
			return { ok: false, problem: "not_joined" } as const;
		}

		await tx.delete(participants).where(eq(participants.id, found.participant.id));
		await touchEvent(tx, found.event, now);

		return { ok: true } as const;
	});
}
