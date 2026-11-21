// Accounts with Better Auth (ADR 0009): sign-in by an email link and by passkeys, sessions in a
// cookie, no names, no visitor addresses and no telemetry. Only this module configures it.
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
	accountSettings,
	authAccounts,
	authPasskeys,
	authSessions,
	authUsers,
	authVerifications,
} from "@/db/schema";
import { browserFamily } from "@/domain/browser-family";
import { env } from "@/env";
import { type Locale, localeSchema } from "@/i18n/routing";

import { changeEmailEmail, emailChangeNotice, signInEmail } from "./email/emails";
import { type Email, sendEmail, takeEmailSlot } from "./mail";

/** How long a sign-in or address-change link works. */
const LINK_SECONDS = 15 * 60;

const DAY_SECONDS = 24 * 60 * 60;

async function accountLocale(accountId: string): Promise<Locale> {
	const [row] = await db()
		.select({ locale: accountSettings.locale })
		.from(accountSettings)
		.where(eq(accountSettings.accountId, accountId));

	return localeSchema.parse(row?.locale);
}

/**
 * The language of the account's emails. The first time an account is seen, it takes the
 * language of the page, which is the page that asked for its sign-in link.
 */
export async function accountLocaleOrSet(accountId: string, pageLocale: Locale): Promise<Locale> {
	await db()
		.insert(accountSettings)
		.values({ accountId, locale: pageLocale })
		.onConflictDoNothing({ target: accountSettings.accountId });

	return accountLocale(accountId);
}

/** Sends an email that a visitor waits for, within the limits of the address and the instance. */
async function sendLinkEmail(address: string, email: Email): Promise<void> {
	if (!(await takeEmailSlot(address))) {
		throw APIError.fromStatus("TOO_MANY_REQUESTS", { code: "too_many_emails" });
	}

	try {
		await sendEmail(email);
	} catch {
		throw APIError.fromStatus("SERVICE_UNAVAILABLE", { code: "email_not_sent" });
	}
}

/** Tells the current address of an account that a change to `newEmail` was asked for. */
async function noticeOldAddress(accountId: string, newEmail: string, locale: Locale) {
	const [current] = await db()
		.select({ email: authUsers.email })
		.from(authUsers)
		.where(eq(authUsers.id, accountId));

	// The notice is no link and needs no per-address limit, but it counts toward the total.
	if (current !== undefined && current.email !== newEmail && (await takeEmailSlot(null))) {
		await sendEmail(await emailChangeNotice(locale, current.email, newEmail));
	}
}

function configure(settings: Extract<ReturnType<typeof env>["accounts"], { kind: "on" }>) {
	return betterAuth({
		appName: "convenr",
		baseURL: settings.publicUrl.origin,
		basePath: "/api/auth",
		secret: settings.secret,
		database: drizzleAdapter(db(), {
			provider: "pg",
			schema: {
				user: authUsers,
				session: authSessions,
				account: authAccounts,
				verification: authVerifications,
				passkey: authPasskeys,
			},
		}),
		// The limits of Better Auth key on the visitor's address, which convenr never keeps;
		// emails are limited per address instead.
		rateLimit: { enabled: false },
		telemetry: { enabled: false },
		advanced: {
			cookiePrefix: "convenr",
			ipAddress: { disableIpTracking: true },
		},
		session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS, freshAge: DAY_SECONDS },
		verification: { storeIdentifier: "hashed" },
		emailVerification: {
			expiresIn: LINK_SECONDS,
			// The only verification an account goes through is a change of its address: the new
			// address gets the link, and the current one a notice.
			sendVerificationEmail: async ({ user, url }) => {
				const locale = await accountLocale(user.id);

				await sendLinkEmail(user.email, await changeEmailEmail(locale, user.email, url));
				await noticeOldAddress(user.id, user.email, locale);
			},
		},
		user: {
			changeEmail: { enabled: true },
			deleteUser: { enabled: true },
		},
		databaseHooks: {
			user: {
				create: { before: (user) => Promise.resolve({ data: { ...user, name: "" } }) },
			},
			session: {
				create: {
					before: (session) =>
						Promise.resolve({
							data: { ...session, ipAddress: null, userAgent: browserFamily(session.userAgent) },
						}),
				},
			},
		},
		plugins: [
			magicLink({
				expiresIn: LINK_SECONDS,
				storeToken: "hashed",
				sendMagicLink: async ({ email, url, metadata }) =>
					sendLinkEmail(
						email,
						await signInEmail(localeSchema.parse(metadata?.["locale"]), email, url),
					),
			}),
			passkey({
				rpID: settings.publicUrl.hostname,
				rpName: "convenr",
				origin: settings.publicUrl.origin,
			}),
			// Lets Server Actions set the session cookie; it must come last.
			nextCookies(),
		],
	});
}

export type Auth = ReturnType<typeof configure>;

declare global {
	var convenrAuth: Auth | undefined;
}

/** Better Auth for this instance, or `undefined` when accounts are off. */
export function auth(): Auth | undefined {
	const { accounts } = env();

	if (accounts.kind === "off") {
		return undefined;
	}

	globalThis.convenrAuth ??= configure(accounts);

	return globalThis.convenrAuth;
}
