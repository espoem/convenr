// Who gets which notification, and the emails that changes write to the outbox in their own
// transaction. Sending them is `deliverOutbox` in `outbox.ts`.
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
	accountNotifications,
	eventNotifications,
	events,
	outboxEmails,
	participants,
	responseDigests,
} from "@/db/schema";
import { eventSegment } from "@/domain/event-address";
import type { FinalTime } from "@/domain/final-time";
import {
	type EventChoice,
	NOTIFICATION_KINDS,
	type NotificationKind,
	type OutboxMessage,
	type StoredFinal,
} from "@/domain/notifications";
import { env } from "@/env";

import { type EventRow, finalOf, liveEvent, type Queries } from "./event-rows";
import { readUnsubscribeValue } from "./unsubscribe-value";

/** Who a kind is for: the owner, the accounts with a linked participant, or both. */
const AUDIENCE: Record<NotificationKind, { owner: boolean; linked: boolean }> = {
	responses: { owner: true, linked: false },
	final: { owner: false, linked: true },
	reminder: { owner: true, linked: true },
};

/**
 * The accounts of event `eventId` that get `kind`: those it is for whose choice for the event,
 * or else on the account page, is on.
 */
export async function recipients(
	queries: Queries,
	eventId: string,
	kind: NotificationKind,
): Promise<string[]> {
	const { owner, linked } = AUDIENCE[kind];

	const result = await queries.execute<{ account_id: string }>(sql`
		with audience as (
			select owner_id as account_id from events
			where ${owner} and id = ${eventId} and owner_id is not null
			union
			select account_id from participants
			where ${linked} and event_id = ${eventId} and account_id is not null
		)
		select audience.account_id from audience
		left join event_notifications chosen on chosen.account_id = audience.account_id
			and chosen.event_id = ${eventId} and chosen.kind = ${kind}
		left join account_notifications general on general.account_id = audience.account_id
			and general.kind = ${kind}
		where coalesce(chosen.enabled, general.enabled, false)`);

	return result.rows.map((row) => row.account_id);
}

/** Writes `message` about event `eventId` to the outbox, once for each of `accountIds`. */
async function queue(
	queries: Queries,
	accountIds: string[],
	eventId: string,
	message: OutboxMessage,
	now: Temporal.Instant,
) {
	if (accountIds.length === 0) {
		return;
	}

	await queries.insert(outboxEmails).values(
		accountIds.map((accountId) => ({
			accountId,
			eventId,
			message,
			nextAttemptAt: now.toString(),
		})),
	);
}

function storedFinal(final: FinalTime): StoredFinal {
	return final.kind === "open"
		? final
		: {
				kind: "chosen",
				start: final.start.toString(),
				end: final.end.toString(),
				sequence: final.sequence,
			};
}

/**
 * Notes that participant `participantId`, named `name`, joined event `event` or changed its
 * response. The owner gets the first new response after a quiet interval at once; later ones
 * wait in the digest until the interval has passed. The owner's own responses are not news to it.
 */
export async function noteResponse(
	tx: Queries,
	event: EventRow,
	participantId: string,
	name: string,
	now: Temporal.Instant,
) {
	const owner = event.ownerId;

	if (owner === null) {
		return;
	}

	const [participant] = await tx
		.select({ accountId: participants.accountId })
		.from(participants)
		.where(eq(participants.id, participantId));

	if (
		participant?.accountId === owner ||
		!(await recipients(tx, event.id, "responses")).includes(owner)
	) {
		return;
	}

	const [digest] = await tx
		.select()
		.from(responseDigests)
		.where(and(eq(responseDigests.accountId, owner), eq(responseDigests.eventId, event.id)))
		.for("update");

	const quietSince = now.subtract({ minutes: env().NOTIFY_DIGEST_MINUTES });

	if (
		digest !== undefined &&
		Temporal.Instant.compare(Temporal.Instant.from(digest.sentAt), quietSince) > 0
	) {
		await tx
			.update(responseDigests)
			.set({
				waiting: sql`array(select distinct unnest(array_append(${responseDigests.waiting}, ${name}::text)))`,
			})
			.where(and(eq(responseDigests.accountId, owner), eq(responseDigests.eventId, event.id)));

		return;
	}

	const names = [...new Set([...(digest?.waiting ?? []), name])];

	await queue(tx, [owner], event.id, { kind: "responses", names }, now);
	await tx
		.insert(responseDigests)
		.values({ accountId: owner, eventId: event.id, sentAt: now.toString(), waiting: [] })
		.onConflictDoUpdate({
			target: [responseDigests.accountId, responseDigests.eventId],
			set: { sentAt: now.toString(), waiting: [] },
		});
}

/**
 * Notes that the final time of `event` changed, as written: the accounts of linked participants
 * get the new final time, or the notice that it was cleared. A final time picked less than the
 * reminder hours before its start gets no reminder.
 */
export async function noteFinal(tx: Queries, event: EventRow, now: Temporal.Instant) {
	const final = finalOf(event);

	await queue(
		tx,
		await recipients(tx, event.id, "final"),
		event.id,
		{ kind: "final", final: storedFinal(final) },
		now,
	);

	if (
		final.kind === "chosen" &&
		Temporal.Instant.compare(final.start.subtract({ hours: env().REMINDER_HOURS }), now) < 0
	) {
		await tx
			.update(events)
			.set({ remindedSequence: final.sequence })
			.where(eq(events.id, event.id));
	}
}

/**
 * Writes the emails that came due by `now`: digests whose interval has passed and reminders of
 * final times that start within the reminder hours. Several servers may run it side by side; a
 * locked row is left to the one that holds it.
 */
export async function queueDue(now: Temporal.Instant): Promise<void> {
	const quietSince = now.subtract({ minutes: env().NOTIFY_DIGEST_MINUTES }).toString();

	await db().transaction(async (tx) => {
		const due = await tx
			.select()
			.from(responseDigests)
			.where(
				and(
					sql`cardinality(${responseDigests.waiting}) > 0`,
					sql`${responseDigests.sentAt} <= ${quietSince}`,
				),
			)
			.for("update", { skipLocked: true });

		// One transaction runs its statements one after another, whatever the order they are sent in.
		await Promise.all(
			due.map(async (digest) => {
				// The account may have turned the kind off while the names waited.
				const wanted = (await recipients(tx, digest.eventId, "responses")).includes(
					digest.accountId,
				);

				await queue(
					tx,
					wanted ? [digest.accountId] : [],
					digest.eventId,
					{ kind: "responses", names: digest.waiting },
					now,
				);
				await tx
					.update(responseDigests)
					.set({ sentAt: now.toString(), waiting: [] })
					.where(
						and(
							eq(responseDigests.accountId, digest.accountId),
							eq(responseDigests.eventId, digest.eventId),
						),
					);
			}),
		);
	});

	const horizon = now.add({ hours: env().REMINDER_HOURS }).toString();

	await db().transaction(async (tx) => {
		const starting = await tx
			.select({
				id: events.id,
				start: events.finalStart,
				end: events.finalEnd,
				sequence: events.finalSequence,
			})
			.from(events)
			.where(
				and(
					eq(events.finalState, "chosen"),
					sql`${events.remindedSequence} <> ${events.finalSequence}`,
					sql`${events.finalStart} <= ${horizon}`,
					sql`${events.finalStart} > ${now.toString()}`,
				),
			)
			.for("update", { skipLocked: true });

		await Promise.all(
			starting.map(async (event) => {
				// The check of the final columns guarantees both instants of a chosen final time.
				const final = {
					kind: "chosen" as const,
					start: Temporal.Instant.from(event.start ?? "").toString(),
					end: Temporal.Instant.from(event.end ?? "").toString(),
					sequence: event.sequence,
				};

				await queue(
					tx,
					await recipients(tx, event.id, "reminder"),
					event.id,
					{ kind: "reminder", final },
					now,
				);
				await tx
					.update(events)
					.set({ remindedSequence: event.sequence })
					.where(eq(events.id, event.id));
			}),
		);
	});
}

/** What the account chose on the account page, per kind. */
export async function accountChoices(
	accountId: string,
): Promise<Record<NotificationKind, boolean>> {
	const rows = await db()
		.select({ kind: accountNotifications.kind, enabled: accountNotifications.enabled })
		.from(accountNotifications)
		.where(eq(accountNotifications.accountId, accountId));

	const chosen = new Map(rows.map((row) => [row.kind, row.enabled]));

	return {
		responses: chosen.get("responses") ?? false,
		final: chosen.get("final") ?? false,
		reminder: chosen.get("reminder") ?? false,
	};
}

/** Saves the account page's choice of every kind. */
export async function setAccountChoices(
	accountId: string,
	choices: Record<NotificationKind, boolean>,
): Promise<void> {
	await db()
		.insert(accountNotifications)
		.values(NOTIFICATION_KINDS.map((kind) => ({ accountId, kind, enabled: choices[kind] })))
		.onConflictDoUpdate({
			target: [accountNotifications.accountId, accountNotifications.kind],
			set: { enabled: sql`excluded.enabled` },
		});
}

/** The kinds that are for the account in event `eventId`, with its choice and the account page's. */
export type EventChoices = {
	kind: NotificationKind;
	choice: EventChoice;
	/** What `account` means here. */
	general: boolean;
}[];

/** The account's choices for event `eventId`, of the kinds that are for it there. */
export async function eventChoices(accountId: string, eventId: string): Promise<EventChoices> {
	const [role] = await db()
		.select({
			owner: sql<boolean>`${events.ownerId} = ${accountId}`,
			// Named in full: the select list writes `events.id` as a bare `id`, which the subquery
			// would read as the participant's.
			linked: sql<boolean>`exists (select 1 from participants
				where participants.event_id = events.id and participants.account_id = ${accountId})`,
		})
		.from(events)
		.where(eq(events.id, eventId));

	if (role === undefined) {
		return [];
	}

	const chosen = await db()
		.select({ kind: eventNotifications.kind, enabled: eventNotifications.enabled })
		.from(eventNotifications)
		.where(
			and(eq(eventNotifications.accountId, accountId), eq(eventNotifications.eventId, eventId)),
		);

	const choices = new Map(chosen.map((row) => [row.kind, row.enabled ? "on" : "off"] as const));
	const general = await accountChoices(accountId);

	return NOTIFICATION_KINDS.filter(
		(kind) => (AUDIENCE[kind].owner && role.owner) || (AUDIENCE[kind].linked && role.linked),
	).map((kind) => ({ kind, choice: choices.get(kind) ?? "account", general: general[kind] }));
}

export type UnsubscribeResult =
	| { status: "unsubscribed"; kind: NotificationKind }
	| { status: "invalid" };

function readValue(value: string) {
	const accounts = env().accounts;

	return accounts.kind === "on" ? readUnsubscribeValue(value, accounts.secret) : undefined;
}

/** What a signed unsubscribe value turns off, and the event it names while that event lives. */
export type UnsubscribeTarget =
	| { status: "invalid" }
	| { status: "event_gone"; kind: NotificationKind }
	| { status: "event"; kind: NotificationKind; name: string; segment: string };

/** What the unsubscribe page says a value turns off, so a reader knows which event it is. */
export async function unsubscribeTarget(
	value: string,
	now = Temporal.Now.instant(),
): Promise<UnsubscribeTarget> {
	const named = readValue(value);

	if (named === undefined) {
		return { status: "invalid" };
	}

	const row = await liveEvent(db(), named.eventId, now, "read");

	return row === undefined
		? { status: "event_gone", kind: named.kind }
		: {
				status: "event",
				kind: named.kind,
				name: row.name,
				segment: eventSegment(row.id, row.name),
			};
}

/**
 * Turns off the kind that a signed unsubscribe value names, for its event, without signing in.
 * A value that is malformed or signed with another secret changes nothing.
 */
export async function unsubscribe(value: string): Promise<UnsubscribeResult> {
	const named = readValue(value);

	if (named === undefined) {
		return { status: "invalid" };
	}

	await setEventChoice(db(), named.accountId, named.eventId, named.kind, "off");

	return { status: "unsubscribed", kind: named.kind };
}

/** Sets the account's choice of `kind` for event `eventId`; `account` follows the account page. */
export async function setEventChoice(
	queries: Queries,
	accountId: string,
	eventId: string,
	kind: NotificationKind,
	choice: EventChoice,
): Promise<void> {
	const key = and(
		eq(eventNotifications.accountId, accountId),
		eq(eventNotifications.eventId, eventId),
		eq(eventNotifications.kind, kind),
	);

	if (choice === "account") {
		await queries.delete(eventNotifications).where(key);

		return;
	}

	// An event that is gone takes no choice.
	await queries.execute(sql`
		insert into event_notifications (account_id, event_id, kind, enabled)
		select ${accountId}, id, ${kind}, ${choice === "on"} from events where id = ${eventId}
		on conflict (account_id, event_id, kind) do update set enabled = excluded.enabled`);
}
