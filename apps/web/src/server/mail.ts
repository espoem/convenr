// Sending email over SMTP (ADR 0009 item 7) and the limits that keep a sign-in form from
// flooding an inbox: a few emails per address per hour and a total per instance.
import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";
import { createTransport, type Transporter } from "nodemailer";

import { db } from "@/db/client";
import { emailCounts } from "@/db/schema";
import { env } from "@/env";

import type { Queries } from "./event-rows";

/** Sign-in and address-change emails one address gets per hour at most. */
export const LINKS_PER_ADDRESS = 3;

export type Email = {
	to: string;
	subject: string;
	text: string;
	html: string;
	headers?: Record<string, string>;
};

declare global {
	var convenrMail: Transporter | undefined;
}

function settings() {
	const { accounts } = env();

	if (accounts.kind === "off") {
		throw new Error("Email needs the account settings, and accounts are off.");
	}

	return accounts;
}

/** The connection address with timeouts, unless it sets its own: nodemailer reads them there. */
function connectionUrl(smtpUrl: string): string {
	const url = new URL(smtpUrl);

	// A mail server that does not answer must not hold a visitor's request for long.
	for (const [name, milliseconds] of [
		["connectionTimeout", "10000"],
		["greetingTimeout", "10000"],
		["socketTimeout", "20000"],
	] as const) {
		if (!url.searchParams.has(name)) {
			url.searchParams.set(name, milliseconds);
		}
	}

	return url.toString();
}

function transport(): Transporter {
	globalThis.convenrMail ??= createTransport(connectionUrl(settings().smtpUrl));

	return globalThis.convenrMail;
}

/** Sends one email; throws when the mail server refuses it or does not answer. */
export async function sendEmail(email: Email): Promise<void> {
	await transport().sendMail({ from: settings().mailFrom, ...email });
}

/** The key an address is counted under: its HMAC, so no plain address is stored. */
export function addressKey(address: string, secret: string): string {
	return createHmac("sha256", secret).update(address.trim().toLowerCase()).digest("base64url");
}

function hourOf(now: Temporal.Instant): string {
	return now.round({ smallestUnit: "hour", roundingMode: "floor" }).toString();
}

class OverLimit extends Error {}

/** Counts one more email under `key` in this hour, unless the count already reached `limit`. */
async function count(tx: Queries, key: string, hour: string, limit: number) {
	const [row] = await tx
		.insert(emailCounts)
		.values({ key, hour, count: 1 })
		.onConflictDoUpdate({
			target: [emailCounts.key, emailCounts.hour],
			set: { count: sql`${emailCounts.count} + 1` },
			setWhere: sql`${emailCounts.count} < ${limit}`,
		})
		.returning({ count: emailCounts.count });

	if (row === undefined) {
		throw new OverLimit();
	}
}

/**
 * Takes one email from the hour's limits: per address when `address` is given, and always from
 * the instance's total. Answers `false`, and counts nothing, when either limit is reached.
 */
export async function takeEmailSlot(
	address: string | null,
	now = Temporal.Now.instant(),
): Promise<boolean> {
	const { secret } = settings();
	const hour = hourOf(now);

	try {
		await db().transaction(async (tx) => {
			if (address !== null) {
				await count(tx, addressKey(address, secret), hour, LINKS_PER_ADDRESS);
			}

			await count(tx, "all", hour, env().MAIL_HOURLY_LIMIT);
		});

		return true;
	} catch (error) {
		if (error instanceof OverLimit) {
			return false;
		}

		throw error;
	}
}
