// Joining, passwords and leaving.
import { and, count, eq, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { participants, participantTokens } from "@/db/schema";
import { parseDisplayName } from "@/domain/display-name";
import { newPublicId } from "@/domain/public-id";

import {
	byToken,
	type Holder,
	liveEvent,
	participantForChange,
	participantOf,
	type ParticipantRead,
	participantRead,
	type Queries,
	scheduleOf,
	touchEvent,
} from "./event-rows";
import { noteResponse } from "./notifications";
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

export type JoinRefusal =
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
				| "no_password"
				/** The name's participant is linked to an account, which alone opens it. */
				| "name_in_account";
	  };

export type JoinResult =
	/** The participant as the write left them, so an answer needs no second read. */
	({ ok: true; token: string; hasPassword: boolean } & ParticipantRead) | JoinRefusal;

/** A signed-in join: the participant is linked to the account and gets no token. */
export type LinkedJoinResult =
	| ({ ok: true; linked: true; hasPassword: boolean } & ParticipantRead)
	| JoinRefusal;

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
 * What a join gives once the name and the password fit. `admits` tells whether the join may enter
 * a used name's participant, checked before the password is tried and again under the event
 * lock; `give` hands out the access under that lock.
 */
type Grant<Access extends object> = {
	admits: (participant: { accountId: string | null }) => boolean;
	give: (tx: Queries, eventId: string, participantId: string) => Promise<Access>;
};

/** A linked participant is reached through its account only, so no token is issued for it. */
function tokenGrant(source: TokenSource): Grant<{ token: string }> {
	return {
		admits: (participant) => participant.accountId === null,
		give: async (tx, _eventId, participantId) => ({
			token: await issueToken(tx, participantId, source),
		}),
	};
}

/**
 * Links the participant to the account and retires every token it has, so that from then on
 * only the account reaches it. An account is one participant of an event at most, so a
 * participant it was linked to before in the event is unlinked first and stays as it is.
 */
async function linkTo(queries: Queries, eventId: string, participantId: string, accountId: string) {
	await queries
		.update(participants)
		.set({ accountId: null })
		.where(and(eq(participants.eventId, eventId), eq(participants.accountId, accountId)));
	await queries.update(participants).set({ accountId }).where(eq(participants.id, participantId));
	await queries.delete(participantTokens).where(eq(participantTokens.participantId, participantId));
}

function accountGrant(accountId: string): Grant<{ linked: true }> {
	return {
		admits: (participant) => participant.accountId === null || participant.accountId === accountId,
		give: async (tx, eventId, participantId) => {
			await linkTo(tx, eventId, participantId, accountId);

			return { linked: true };
		},
	};
}

const NAME_IN_ACCOUNT = { ok: false, problem: "name_in_account" } as const;

type Entered<Access> =
	| ({ ok: true; hasPassword: boolean } & Access & ParticipantRead)
	| JoinRefusal;

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
	| { kind: "counted"; lockEnd: string | null; cycle: number }
	| { kind: "locking"; lockEnd: string; previousLockEnd: string | null; cycle: number }
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
	const keeping = sql`${participants.lastAttemptAt} > ${forgetBefore}::timestamptz`;
	const kept = sql`case when ${keeping} then ${participants.failedAttempts} else 0 end`;
	const last = sql`${kept} + 1 >= ${MAX_FAILED_ATTEMPTS}`;
	const nextCycle = sql`case when ${keeping} then ${participants.attemptCycle} else ${participants.attemptCycle} + 1 end`;

	const [taken] = await db()
		.update(participants)
		.set({
			failedAttempts: sql`case when ${last} then 0 else ${kept} + 1 end`,
			lastAttemptAt: now.toString(),
			lockedUntil: sql`case when ${last} then ${now.add(LOCKOUT).toString()}::timestamptz else ${participants.lockedUntil} end`,
			attemptCycle: nextCycle,
			attemptRefunds: sql`case when ${keeping} and not (${last}) then ${participants.attemptRefunds} else 0 end`,
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
			cycle: participants.attemptCycle,
		});

	if (taken !== undefined) {
		return taken.failedAttempts === 0 && taken.lockEnd !== null
			? {
					kind: "locking",
					lockEnd: taken.lockEnd,
					previousLockEnd: taken.previousLockEnd,
					cycle: taken.cycle,
				}
			: { kind: "counted", lockEnd: taken.lockEnd, cycle: taken.cycle };
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
 * alongside it, and a lockout that other attempts set, stay. A refund that arrives while a
 * concurrent locking attempt holds the lock is recorded so that locking attempt can subtract it
 * if it also succeeds.
 */
async function undoAttempt(
	participantId: string,
	attempt: Extract<Attempt, { kind: "counted" | "locking" }>,
) {
	if (attempt.kind === "counted") {
		await db()
			.update(participants)
			.set({
				failedAttempts: sql`case when ${participants.lockedUntil} is not distinct from ${attempt.lockEnd}::timestamptz then greatest(0, ${participants.failedAttempts} - 1) else ${participants.failedAttempts} end`,
				attemptRefunds: sql`case when ${participants.lockedUntil} is distinct from ${attempt.lockEnd}::timestamptz then ${participants.attemptRefunds} + 1 else ${participants.attemptRefunds} end`,
			})
			.where(and(eq(participants.id, participantId), eq(participants.attemptCycle, attempt.cycle)));

		return;
	}

	await db()
		.update(participants)
		.set({
			failedAttempts: sql`greatest(0, ${MAX_FAILED_ATTEMPTS - 1} - ${participants.attemptRefunds})`,
			attemptRefunds: 0,
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
	return enter(eventId, rawName, password, now, verify, tokenGrant(source));
}

/**
 * Joins as the signed-in account: the participant is linked to it and gets no token, so a
 * shared browser keeps no access once the account signs out. A used name's other tokens are
 * retired. A name linked to another account is refused, as any join outside the account is.
 */
export async function joinLinked(
	eventId: string,
	rawName: string,
	password: JoinPassword,
	accountId: string,
	now = Temporal.Now.instant(),
	verify: PasswordVerifier = verifyPassword,
): Promise<LinkedJoinResult> {
	return enter(eventId, rawName, password, now, verify, accountGrant(accountId));
}

async function enter<Access extends object>(
	eventId: string,
	rawName: string,
	password: JoinPassword,
	now: Temporal.Instant,
	verify: PasswordVerifier,
	grant: Grant<Access>,
): Promise<Entered<Access>> {
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
			? await joinNew(eventId, name, password, now, grant)
			: await joinExisting(eventId, existing, password, now, verify, grant);

	// Another browser took or freed the name between the lookup and the lock.
	if (isNameTaken(joined)) {
		return enter(eventId, rawName, password, now, verify, grant);
	}

	return joined;
}

type NameTaken = { ok: false; problem: "name_taken" };

/** Any answer of a join step. */
type StepResult = { ok: boolean };

function isNameTaken(result: StepResult): result is NameTaken {
	return !result.ok && "problem" in result && result.problem === "name_taken";
}

/** Access to a used name, given under the event lock once the password fits. */
async function joinExisting<Access extends object>(
	eventId: string,
	existing: ParticipantRow,
	password: JoinPassword,
	now: Temporal.Instant,
	verify: PasswordVerifier,
	grant: Grant<Access>,
): Promise<Entered<Access> | NameTaken> {
	// First, so that a linked name tells nothing about its password.
	if (!grant.admits(existing)) {
		return NAME_IN_ACCOUNT;
	}

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

	return db().transaction(async (tx): Promise<Entered<Access> | NameTaken> => {
		// The event may have expired or been deleted, or the participant left or was linked,
		// while the password was checked.
		const event = await liveEvent(tx, eventId, now, "lock");

		if (event === undefined) {
			return { ok: false, problem: "not_found" };
		}

		const [still] = await tx
			.select({ accountId: participants.accountId })
			.from(participants)
			.where(eq(participants.id, existing.id));

		if (still === undefined) {
			return { ok: false, problem: "name_taken" };
		}

		if (!grant.admits(still)) {
			return NAME_IN_ACCOUNT;
		}

		return {
			ok: true,
			hasPassword: existing.passwordHash !== null,
			...(await grant.give(tx, eventId, existing.id)),
			...(await participantRead(tx, event, existing)),
		};
	});
}

/** A new participant under a name nobody in the event uses. */
async function joinNew<Access extends object>(
	eventId: string,
	name: { name: string; key: string },
	password: JoinPassword,
	now: Temporal.Instant,
	grant: Grant<Access>,
): Promise<Entered<Access> | NameTaken> {
	if (password.kind === "current") {
		return { ok: false, problem: "name_unknown" };
	}

	const chosen = password.kind === "none" ? undefined : password.password;

	if (chosen !== undefined && !isPasswordLength(chosen)) {
		return { ok: false, problem: "invalid_password" };
	}

	// Hashing takes a while, so it happens before the event row is locked.
	const passwordHash = chosen === undefined ? null : await hashPassword(chosen);

	return db().transaction(async (tx): Promise<Entered<Access> | NameTaken> => {
		// The lock orders joins of one event, so the participant limit and the name check hold.
		const event = await liveEvent(tx, eventId, now, "lock");

		if (event === undefined) {
			return { ok: false, problem: "not_found" };
		}

		const [taken] = await tx
			.select({ id: participants.id })
			.from(participants)
			.where(and(eq(participants.eventId, eventId), eq(participants.nameKey, name.key)));

		if (taken !== undefined) {
			return { ok: false, problem: "name_taken" };
		}

		const [total] = await tx
			.select({ value: count() })
			.from(participants)
			.where(eq(participants.eventId, eventId));

		if ((total?.value ?? 0) >= MAX_PARTICIPANTS) {
			return { ok: false, problem: "event_full" };
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

		// Linking comes first, so the owner's own participant is known as the owner's.
		const access = await grant.give(tx, eventId, row.id);

		await noteResponse(tx, event, row.id, name.name, now);

		return {
			ok: true,
			hasPassword: passwordHash !== null,
			...access,
			participant: { id: row.publicId, name: name.name, levels: {} },
			schedule: scheduleOf(event),
		};
	});
}

/** The participant a page shows as the visitor; `linked` when the signed-in account names it. */
export type Identified = { name: string; hasPassword: boolean; linked: boolean };

/** Whom `holder` joined `eventId` as, so a browser reopens the event already joined. */
export async function identify(
	eventId: string,
	holder: Holder,
	now = Temporal.Now.instant(),
): Promise<Identified | undefined> {
	const found = await participantOf(db(), eventId, holder, now);

	return found === undefined
		? undefined
		: {
				name: found.participant.displayName,
				hasPassword: found.participant.passwordHash !== null,
				linked: holder.kind === "account",
			};
}

/** Whether the account has a participant in `eventId`. */
export async function isLinkedIn(
	eventId: string,
	accountId: string,
	queries: Queries = db(),
): Promise<boolean> {
	const [row] = await queries
		.select({ id: participants.id })
		.from(participants)
		.where(and(eq(participants.eventId, eventId), eq(participants.accountId, accountId)));

	return row !== undefined;
}

export type LinkResult = { status: "linked" } | { status: "not_joined" | "account_already_joined" };

/**
 * Links the participant whose token a browser holds to the account and retires its tokens, so
 * the browser keeps no access of its own once the account signs out. An account that already
 * has another participant in the event is refused. A token never names a linked participant.
 */
export async function linkHeld(
	eventId: string,
	token: string,
	accountId: string,
	now = Temporal.Now.instant(),
): Promise<LinkResult> {
	return db().transaction(async (tx): Promise<LinkResult> => {
		const found = await participantForChange(tx, eventId, byToken(token), now);

		if (found === undefined) {
			return { status: "not_joined" };
		}

		if (await isLinkedIn(eventId, accountId, tx)) {
			return { status: "account_already_joined" };
		}

		await linkTo(tx, eventId, found.participant.id, accountId);

		return { status: "linked" };
	});
}

/**
 * Unlinks the account's participant in `eventId`, which stays as an ordinary participant, and
 * gives the browser that asked a token for it, so the browser stays joined. Answers whether the
 * account had a participant there.
 */
export async function unlink(
	eventId: string,
	accountId: string,
	browserToken: string,
	now = Temporal.Now.instant(),
): Promise<boolean> {
	return db().transaction(async (tx) => {
		const found = await participantForChange(tx, eventId, { kind: "account", accountId }, now);

		if (found === undefined) {
			return false;
		}

		await tx
			.update(participants)
			.set({ accountId: null })
			.where(eq(participants.id, found.participant.id));
		await issueToken(tx, found.participant.id, { kind: "browser", token: browserToken });

		return true;
	});
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
): Promise<Identified | undefined> {
	return db().transaction(async (tx) => {
		const found = await participantForChange(tx, eventId, byToken(oldToken), now);

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
			linked: false,
		};
	});
}

/** Removes one token, so its browser no longer opens the event joined; the participant stays. */
export async function forgetToken(eventId: string, token: string, now = Temporal.Now.instant()) {
	const found = await participantOf(db(), eventId, byToken(token), now);

	if (found !== undefined) {
		await db()
			.delete(participantTokens)
			.where(eq(participantTokens.tokenHash, hashSecret(token)));
	}
}

/** The participant of `holder` in `eventId` as the event shows them, or `undefined`. */
export async function readParticipant(
	eventId: string,
	holder: Holder,
	now = Temporal.Now.instant(),
): Promise<ParticipantRead | undefined> {
	const found = await participantOf(db(), eventId, holder, now);

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
 * Sets, changes or removes (`next` is `null`) the password of the holder's participant.
 * Changing or removing a stored password needs the current one.
 */
export async function changePassword(
	eventId: string,
	holder: Holder,
	current: CurrentPassword,
	next: string | null,
	now = Temporal.Now.instant(),
): Promise<PasswordChangeResult> {
	const found = await participantOf(db(), eventId, holder, now);

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
			const locked = await participantForChange(tx, eventId, holder, now);

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
		? changePassword(eventId, holder, current, next, now)
		: written;
}

/** Deletes the holder's participant with its response, password and tokens. */
export async function leave(eventId: string, holder: Holder, now = Temporal.Now.instant()) {
	return db().transaction(async (tx) => {
		const found = await participantForChange(tx, eventId, holder, now);

		if (found === undefined) {
			return { ok: false, problem: "not_joined" } as const;
		}

		await tx.delete(participants).where(eq(participants.id, found.participant.id));
		await touchEvent(tx, found.event, now);

		return { ok: true } as const;
	});
}
