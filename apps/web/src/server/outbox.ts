// Sending the notification emails of the outbox. Each one is read, checked and sent in its own
// transaction, so a server that stops mid-way leaves the rest waiting and sends nothing twice
// that it finished. An email a later change overtook, or one its account no longer wants, is
// dropped instead.
import { eq, sql } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db/client";
import { accountSettings, authUsers, outboxEmails } from "@/db/schema";
import { calendarFile } from "@/domain/calendar";
import { shareUrl } from "@/domain/event-address";
import type { FinalTime } from "@/domain/final-time";
import { MAX_ATTEMPTS, type OutboxMessage, RETRY_DELAYS_MINUTES } from "@/domain/notifications";
import { env } from "@/env";
import { localeSchema, routing } from "@/i18n/routing";

import { calendarEntryOf } from "./calendar";
import { notificationEmail } from "./email/emails";
import { readEvent } from "./events";
import { type Email, sendEmail, takeEmailSlot } from "./mail";
import { recipients } from "./notifications";
import { unsubscribeValue } from "./unsubscribe-value";

/** Emails one pass sends at most, so a pass ends within the time a function may run. */
const PER_PASS = 50;

type Outcome = "sent" | "dropped" | "failed" | "over_limit" | "none_due";

/** Whether `message` still says what the event is: a later final time overtakes the earlier email. */
function isCurrent(message: OutboxMessage, final: FinalTime, now: Temporal.Instant) {
	if (message.kind === "responses") {
		return true;
	}

	// Every pick or change moves the sequence, and clearing keeps it, so the kind and the
	// sequence name one final time.
	const same = message.final.kind === final.kind && message.final.sequence === final.sequence;

	return message.kind === "final"
		? same
		: same && Temporal.Instant.compare(Temporal.Instant.from(message.final.start), now) > 0;
}

/** Sends the next due email, if any, and says what became of it. */
async function deliverOne(now: Temporal.Instant, send: Send): Promise<Outcome> {
	const accounts = env().accounts;

	if (accounts.kind === "off") {
		return "none_due";
	}

	return db().transaction(async (tx): Promise<Outcome> => {
		const [email] = await tx
			.select()
			.from(outboxEmails)
			.where(sql`${outboxEmails.nextAttemptAt} <= ${now.toString()}`)
			.orderBy(outboxEmails.nextAttemptAt, outboxEmails.id)
			.limit(1)
			.for("update", { skipLocked: true });

		if (email === undefined) {
			return "none_due";
		}

		const drop = async (): Promise<Outcome> => {
			await tx.delete(outboxEmails).where(eq(outboxEmails.id, email.id));

			return "dropped";
		};

		const event = await readEvent(email.eventId, now);
		const kind = email.message.kind;

		if (
			event === undefined ||
			!isCurrent(email.message, event.final, now) ||
			!(await recipients(tx, email.eventId, kind)).includes(email.accountId)
		) {
			return drop();
		}

		const [account] = await tx
			.select({ email: authUsers.email, locale: accountSettings.locale })
			.from(authUsers)
			.leftJoin(accountSettings, eq(accountSettings.accountId, authUsers.id))
			.where(eq(authUsers.id, email.accountId));

		if (account === undefined) {
			return drop();
		}

		// The instance's hourly total counts these emails too; over it, the email waits.
		if (!(await takeEmailSlot(null, now))) {
			return "over_limit";
		}

		const locale = localeSchema.catch(routing.defaultLocale).parse(account.locale);
		const origin = accounts.publicUrl.origin;

		const value = unsubscribeValue(
			{ accountId: email.accountId, eventId: email.eventId, kind },
			accounts.secret,
		);

		const entry = email.message.kind === "final" ? calendarEntryOf(event, origin) : undefined;

		const message = await notificationEmail(
			{
				locale,
				to: account.email,
				event: {
					name: event.name,
					referenceZone: event.schedule.referenceZone,
					shareUrl: shareUrl(origin, event.segment),
				},
				unsubscribe: {
					page: `${origin}/${locale}/unsubscribe?value=${value}`,
					oneClick: `${origin}/api/unsubscribe?value=${value}`,
				},
				calendar:
					entry === undefined
						? null
						: { filename: `${event.segment}.ics`, content: calendarFile(entry, now) },
			},
			email.message,
		);

		try {
			await send(message);
		} catch {
			// The error names the mail server's answer, which may quote the address; it is not logged.
			if (email.attempts + 1 >= MAX_ATTEMPTS) {
				await drop();

				return "failed";
			}

			const delay = RETRY_DELAYS_MINUTES[email.attempts] ?? RETRY_DELAYS_MINUTES.at(-1) ?? 0;

			await tx
				.update(outboxEmails)
				.set({
					attempts: email.attempts + 1,
					nextAttemptAt: now.add({ minutes: delay }).toString(),
				})
				.where(eq(outboxEmails.id, email.id));

			return "failed";
		}

		await tx.delete(outboxEmails).where(eq(outboxEmails.id, email.id));

		return "sent";
	});
}

/** How an email leaves the server: over SMTP, or into a test's list. */
export type Send = (email: Email) => Promise<void>;

/**
 * Sends the due emails of the outbox one after another with `send`, up to `left` of them, and
 * answers how many went out.
 */
export async function deliverOutbox(
	now = Temporal.Now.instant(),
	send: Send = sendEmail,
	left = PER_PASS,
): Promise<number> {
	if (left === 0) {
		return 0;
	}

	const outcome = await deliverOne(now, send);

	if (outcome === "none_due" || outcome === "over_limit") {
		return 0;
	}

	return (outcome === "sent" ? 1 : 0) + (await deliverOutbox(now, send, left - 1));
}

/**
 * Sends what a change just wrote to the outbox once the response has gone out. Whatever is left
 * waits for the maintenance pass.
 */
export function sendSoon(): void {
	if (env().accounts.kind === "off") {
		return;
	}

	try {
		after(async () => {
			try {
				await deliverOutbox();
			} catch {
				console.error("Sending the outbox after a change failed; the maintenance pass retries it.");
			}
		});
	} catch {
		// `after` throws outside a request, as when a test or a script calls a route handler.
		// Nothing waits for an answer there, and the maintenance pass sends the outbox.
	}
}
