// Joining, passwords and leaving: spec rules P1 to P9.
import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { events, participants, participantTokens } from "@/db/schema";
import { parseDisplayName } from "@/domain/display-name";

import { participantByToken, type Queries, touchEvent } from "./event-rows";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";
import { hashSecret, newSecret } from "./secrets";

export const MAX_PARTICIPANTS = 100;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT = Temporal.Duration.from({ minutes: 15 });

type ParticipantRow = typeof participants.$inferSelect;

export type PasswordRefusal =
  | { ok: false; problem: "password-required" | "wrong-password" }
  | { ok: false; problem: "locked"; retryAt: Temporal.Instant };

export type JoinResult =
  | { ok: true; name: string; token: string }
  | PasswordRefusal
  | {
      ok: false;
      problem: "not-found" | "invalid-name" | "invalid-password" | "full";
    };

function isPasswordLength(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

async function issueToken(queries: Queries, participantId: string): Promise<string> {
  const token = newSecret();

  await queries.insert(participantTokens).values({ tokenHash: hashSecret(token), participantId });

  return token;
}

/**
 * Checks `password` against the participant's stored hash by rule P7: a locked participant
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
    return { ok: false, problem: "locked", retryAt: lockedUntil };
  }

  if (participant.passwordHash === null) {
    return { ok: true };
  }

  if (password === undefined) {
    return { ok: false, problem: "password-required" };
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
    ? { ok: false, problem: "locked", retryAt }
    : { ok: false, problem: "wrong-password" };
}

async function participantByName(eventId: string, key: string) {
  const [found] = await db()
    .select()
    .from(participants)
    .where(and(eq(participants.eventId, eventId), eq(participants.nameKey, key)));

  return found;
}

/** Joins an event under a display name by rule P4. */
export async function join(
  eventId: string,
  rawName: string,
  password?: string,
  now = Temporal.Now.instant(),
): Promise<JoinResult> {
  const name = parseDisplayName(rawName);

  if (!name.ok) {
    return { ok: false, problem: "invalid-name" };
  }

  const existing = await participantByName(eventId, name.key);

  if (existing !== undefined) {
    const checked = await checkPassword(existing, password, now);

    return checked.ok
      ? { ok: true, name: existing.displayName, token: await issueToken(db(), existing.id) }
      : checked;
  }

  if (password !== undefined && !isPasswordLength(password)) {
    return { ok: false, problem: "invalid-password" };
  }

  // Hashing takes a while, so it happens before the event row is locked.
  const passwordHash = password === undefined ? null : await hashPassword(password);

  const created = await db().transaction(async (tx) => {
    // The lock orders joins of one event, so the limit and the name check hold (P2, P3).
    const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for("update");

    if (event === undefined) {
      return { ok: false, problem: "not-found" } as const;
    }

    const [taken] = await tx
      .select({ id: participants.id })
      .from(participants)
      .where(and(eq(participants.eventId, eventId), eq(participants.nameKey, name.key)));

    if (taken !== undefined) {
      return { ok: false, problem: "name-taken-meanwhile" } as const;
    }

    const [total] = await tx
      .select({ value: count() })
      .from(participants)
      .where(eq(participants.eventId, eventId));

    if ((total?.value ?? 0) >= MAX_PARTICIPANTS) {
      return { ok: false, problem: "full" } as const;
    }

    const [row] = await tx
      .insert(participants)
      .values({
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

    return { ok: true, name: name.name, token: await issueToken(tx, row.id) } as const;
  });

  // Someone else joined under this name between the first lookup and the lock.
  if (!created.ok && created.problem === "name-taken-meanwhile") {
    return join(eventId, rawName, password, now);
  }

  return created;
}

/** The name the holder of `token` joined `eventId` under, for rule B2. */
export async function identify(eventId: string, token: string) {
  const found = await participantByToken(db(), eventId, token);

  return found === undefined
    ? undefined
    : { name: found.participant.displayName, hasPassword: found.participant.passwordHash !== null };
}

export type PasswordChangeResult =
  | { ok: true }
  | PasswordRefusal
  | { ok: false; problem: "not-joined" | "invalid-password" | "no-password" };

/**
 * Sets, changes or removes (`next` is `null`) the password of the token's participant by
 * rule P6. Changing or removing a stored password needs the current one.
 */
export async function changePassword(
  eventId: string,
  token: string,
  current: string | undefined,
  next: string | null,
  now = Temporal.Now.instant(),
): Promise<PasswordChangeResult> {
  const found = await participantByToken(db(), eventId, token);

  if (found === undefined) {
    return { ok: false, problem: "not-joined" };
  }

  if (next === null && found.participant.passwordHash === null) {
    return { ok: false, problem: "no-password" };
  }

  if (next !== null && !isPasswordLength(next)) {
    return { ok: false, problem: "invalid-password" };
  }

  const checked = await checkPassword(found.participant, current, now);

  if (!checked.ok) {
    return checked;
  }

  await db()
    .update(participants)
    .set({ passwordHash: next === null ? null : await hashPassword(next) })
    .where(eq(participants.id, found.participant.id));

  return { ok: true };
}

/** Deletes the token's participant with its response, password and tokens by rule P9. */
export async function leave(eventId: string, token: string, now = Temporal.Now.instant()) {
  const found = await participantByToken(db(), eventId, token);

  if (found === undefined) {
    return { ok: false, problem: "not-joined" } as const;
  }

  await db().transaction(async (tx) => {
    await tx.delete(participants).where(eq(participants.id, found.participant.id));
    await touchEvent(tx, found.event, now);
  });

  return { ok: true } as const;
}
