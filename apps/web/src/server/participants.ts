// Joining, passwords and leaving.
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { participants, participantTokens } from "@/db/schema";
import { parseDisplayName } from "@/domain/display-name";
import { newPublicId } from "@/domain/public-id";
import type { Schedule } from "@/domain/schedule";

import {
	availableKeys,
	liveEvent,
	participantByToken,
	type ParticipantView,
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

export type JoinResult =
	| { ok: true; name: string; token: string }
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

async function issueToken(queries: Queries, participantId: string): Promise<string> {
	const token = newSecret("participant");

	await queries.insert(participantTokens).values({ tokenHash: hashSecret(token), participantId });

	return token;
}

/**
 * Checks `password` against the participant's stored hash: a locked participant
 * is refused without a check, and the fifth wrong password in a row locks for 15 minutes.
 */
async function checkPassword(
	participant: ParticipantRow,
	password: string | undefined,
	now: Temporal.Instant,
): Promise<PasswordRefusal | { ok: true }> {
	const lockedUntil =
		participant.lockedUntil === null ? undefined : Temporal.Instant.from(participant.lockedUntil);

	if (lockedUntil !== undefined && Temporal.Instant.compare(now, lockedUntil) < 0) {
		return { ok: false, problem: "too_many_attempts", retryAt: lockedUntil };
	}

	if (participant.passwordHash === null) {
		return { ok: true };
	}

	if (password === undefined) {
		return { ok: false, problem: "password_required" };
	}

	if (await verifyPassword(password, participant.passwordHash)) {
		await db()
			.update(participants)
			.set({ failedAttempts: 0 })
			.where(eq(participants.id, participant.id));

		return { ok: true };
	}

	const retryAt = now.add(LOCKOUT);

	// One statement, so that wrong passwords sent at the same time are all counted.
	const [counted] = await db()
		.update(participants)
		.set({
			failedAttempts: sql`case when ${participants.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
        then 0 else ${participants.failedAttempts} + 1 end`,
			lockedUntil: sql`case when ${participants.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
        then ${retryAt.toString()}::timestamptz else ${participants.lockedUntil} end`,
		})
		.where(eq(participants.id, participant.id))
		.returning({ lockedUntil: participants.lockedUntil });

	const locked =
		counted?.lockedUntil !== null &&
		counted?.lockedUntil !== undefined &&
		Temporal.Instant.compare(Temporal.Instant.from(counted.lockedUntil), now) > 0;

	return locked
		? { ok: false, problem: "too_many_attempts", retryAt }
		: { ok: false, problem: "wrong_password" };
}

async function participantByName(eventId: string, key: string) {
	const [found] = await db()
		.select()
		.from(participants)
		.where(and(eq(participants.eventId, eventId), eq(participants.nameKey, key)));

	return found;
}

/** Joins an event under a display name. */
export async function join(
	eventId: string,
	rawName: string,
	password: JoinPassword = NO_PASSWORD,
	now = Temporal.Now.instant(),
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
			? await joinNew(eventId, name, password, now)
			: await joinExisting(eventId, existing, password, now);

	// Another browser took or freed the name between the lookup and the lock.
	if (!joined.ok && joined.problem === "name_taken") {
		return join(eventId, rawName, password, now);
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
): Promise<JoinResult | NameTaken> {
	if (password.kind === "new") {
		return { ok: false, problem: "name_exists" };
	}

	if (password.kind === "current" && existing.passwordHash === null) {
		return { ok: false, problem: "no_password" };
	}

	const given = password.kind === "none" ? undefined : password.password;
	const checked = await checkPassword(existing, given, now);

	if (!checked.ok) {
		return checked;
	}

	return db().transaction(async (tx): Promise<JoinResult | NameTaken> => {
		// The event may have expired or been deleted, or the participant left, while the
		// password was checked.
		if ((await liveEvent(tx, eventId, now, "lock")) === undefined) {
			return { ok: false, problem: "not_found" };
		}

		const [still] = await tx
			.select({ id: participants.id })
			.from(participants)
			.where(eq(participants.id, existing.id));

		return still === undefined
			? { ok: false, problem: "name_taken" }
			: { ok: true, name: existing.displayName, token: await issueToken(tx, existing.id) };
	});
}

/** A new participant under a name nobody in the event uses. */
async function joinNew(
	eventId: string,
	name: { name: string; key: string },
	password: JoinPassword,
	now: Temporal.Instant,
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
			.returning({ id: participants.id });

		if (row === undefined) {
			throw new Error("The participant insert returned no row.");
		}

		await touchEvent(tx, event, now);
		await countFirstResponse(tx, event, now);

		return { ok: true, name: name.name, token: await issueToken(tx, row.id) } as const;
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
 * The participant that holds `token` in `eventId` as the event shows them, with the schedule
 * their slot keys belong to, or `undefined`.
 */
export async function readParticipant(
	eventId: string,
	token: string,
	now = Temporal.Now.instant(),
): Promise<{ participant: ParticipantView; schedule: Schedule } | undefined> {
	const found = await participantByToken(db(), eventId, token, now);

	if (found === undefined) {
		return undefined;
	}

	const { participant, event } = found;
	const keys = await availableKeys(db(), event, [participant.id]);

	return {
		participant: {
			id: participant.publicId,
			name: participant.displayName,
			available: keys.get(participant.id) ?? [],
		},
		schedule: scheduleOf(event),
	};
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
		return checked;
	}

	const passwordHash = next === null ? null : await hashPassword(next);

	await db().transaction(async (tx) => {
		await tx
			.update(participants)
			.set({ passwordHash })
			.where(eq(participants.id, found.participant.id));
		await touchEvent(tx, found.event, now);
	});

	return { ok: true };
}

/** Deletes the token's participant with its response, password and tokens. */
export async function leave(eventId: string, token: string, now = Temporal.Now.instant()) {
	const found = await participantByToken(db(), eventId, token, now);

	if (found === undefined) {
		return { ok: false, problem: "not_joined" } as const;
	}

	await db().transaction(async (tx) => {
		await tx.delete(participants).where(eq(participants.id, found.participant.id));
		await touchEvent(tx, found.event, now);
	});

	return { ok: true } as const;
}
