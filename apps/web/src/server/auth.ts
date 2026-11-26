// Accounts with Better Auth (ADR 0009): sign-in by an email link and by passkeys, sessions in a
// cookie, no names, no visitor addresses and no telemetry. Only this module configures it.
import { passkey } from "@better-auth/passkey";
import { betterAuth, type GenericEndpointContext } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, getOAuthState, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { z } from "zod";

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
import { type Provider, PROVIDER_NAMES, providerSchema } from "@/domain/provider-address";
import { env } from "@/env";
import { type Locale, localeSchema, routing } from "@/i18n/routing";

import { accountProviders } from "./account-providers";
import { changeEmailEmail, emailChangeNotice, providerNotice, signInEmail } from "./email/emails";
import { type Email, sendEmail, takeEmailSlot } from "./mail";
import { socialProviders } from "./providers";

/** How long a sign-in or address-change link works. */
const LINK_SECONDS = 15 * 60;

const DAY_SECONDS = 24 * 60 * 60;

/** An account holds no profile; what a provider sends of one is dropped on every write. */
const NO_PROFILE = { name: "", image: null };

/** Provider tokens are of no use after a sign-in, so none is ever stored. */
const NO_TOKENS = {
	accessToken: null,
	refreshToken: null,
	idToken: null,
	accessTokenExpiresAt: null,
	refreshTokenExpiresAt: null,
	scope: null,
};

/** Better Auth's provider endpoints that only our own pages may use, after their own checks. */
const PRIVATE_PATHS = [
	"/sign-in/social",
	"/link-social",
	"/unlink-account",
	"/list-accounts",
	"/get-access-token",
	"/refresh-token",
	"/account-info",
];

async function accountLocale(accountId: string): Promise<Locale> {
	const [row] = await db()
		.select({ locale: accountSettings.locale })
		.from(accountSettings)
		.where(eq(accountSettings.accountId, accountId));

	// An account created outside a sign-in link, as in tests, has no row until its account page.
	return localeSchema.catch(routing.defaultLocale).parse(row?.locale);
}

/** Gives the account the language `locale` unless it already has one. */
async function keepFirstLocale(accountId: string, locale: Locale): Promise<void> {
	await db()
		.insert(accountSettings)
		.values({ accountId, locale })
		.onConflictDoNothing({ target: accountSettings.accountId });
}

const callbackSchema = z.object({ callbackURL: z.string() });

/**
 * The address a sign-in returns to: an email link names it in its query, and a provider's
 * sign-in in the state it started with.
 */
async function signInCallback(
	request: GenericEndpointContext | null | undefined,
): Promise<string | undefined> {
	// An account made outside a request, as in tests, started on no page. Better Auth's types say
	// null for it, and the hook gets undefined.
	if (request === null || request === undefined) {
		return undefined;
	}

	const link = callbackSchema.safeParse(request.query);

	if (link.success) {
		return link.data.callbackURL;
	}

	return callbackSchema.safeParse(await getOAuthState()).data?.callbackURL;
}

/** The account the browser of a request is signed in to. */
async function browserAccount(
	request: GenericEndpointContext | null | undefined,
): Promise<string | undefined> {
	if (request === null || request === undefined) {
		return undefined;
	}

	return (await getSessionFromCtx(request))?.user.id;
}

/**
 * The language of the page a sign-in started on: it returns to that language's account page,
 * `/{locale}/account`.
 */
function linkLocale(callbackURL: string): Locale {
	return localeSchema.parse(callbackURL.split("/")[1]);
}

/**
 * The language of the account's emails. An account takes the language of the page that asked
 * for its sign-in link when it is created; an account without one takes the page's language.
 */
export async function accountLocaleOrSet(accountId: string, pageLocale: Locale): Promise<Locale> {
	await keepFirstLocale(accountId, pageLocale);

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

async function accountAddress(accountId: string): Promise<string | undefined> {
	const [current] = await db()
		.select({ email: authUsers.email })
		.from(authUsers)
		.where(eq(authUsers.id, accountId));

	return current?.email;
}

/**
 * Sends a notice about something that happened to an account, as far as it goes: what it tells
 * of is done already. It is no link and needs no per-address limit, but it counts toward the total.
 */
async function sendNotice(email: Email): Promise<void> {
	if (!(await takeEmailSlot(null))) {
		return;
	}

	try {
		await sendEmail(email);
	} catch {
		// The mail server's refusal must not undo what the notice tells of.
	}
}

/** Tells the current address of an account that a change to `newEmail` was asked for. */
async function noticeOldAddress(accountId: string, newEmail: string, locale: Locale) {
	const current = await accountAddress(accountId);

	if (current !== undefined && current !== newEmail) {
		await sendNotice(await emailChangeNotice(locale, current, newEmail));
	}
}

/** Tells the address of an account that a provider was added to it. */
export async function noticeProvider(accountId: string, provider: Provider): Promise<void> {
	const address = await accountAddress(accountId);

	if (address !== undefined) {
		await sendNotice(
			await providerNotice(await accountLocale(accountId), address, PROVIDER_NAMES[provider]),
		);
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
		socialProviders: socialProviders(settings.providers),
		account: {
			updateAccountOnSignIn: false,
			accountLinking: {
				// A provider joins an existing account only from a session of that account.
				disableImplicitLinking: true,
				allowDifferentEmails: true,
				allowUnlinkingAll: true,
				// Lets a session add a provider whose address is not proved; a sign-in without a
				// session never reaches this.
				trustedProviders: settings.providers.map(({ provider }) => provider),
			},
		},
		onAPIError: {
			// Where a callback without a usable state ends, as it names no page to return to.
			errorURL: `${settings.publicUrl.origin}/sign-in`,
			// The route logs an unexpected error; Better Auth would log all of it.
			throw: true,
		},
		disabledPaths: PRIVATE_PATHS,
		// The details can hold a provider's answer or the state of a sign-in.
		logger: { log: (level, message) => console[level](`Better Auth: ${message}`) },
		databaseHooks: {
			user: {
				create: {
					before: (user) => {
						// No account exists before its address is proved, so nobody holds another
						// person's address. The visitor is asked to confirm it by an email link.
						if (!user.emailVerified) {
							throw APIError.fromStatus("FORBIDDEN", { code: "address_not_proved" });
						}

						return Promise.resolve({ data: { ...user, ...NO_PROFILE } });
					},
					after: async (user, context) => {
						const callbackURL = await signInCallback(context);

						if (callbackURL !== undefined) {
							await keepFirstLocale(user.id, linkLocale(callbackURL));
						}
					},
				},
				update: {
					before: (user) => Promise.resolve({ data: { ...user, ...NO_PROFILE } }),
				},
			},
			account: {
				create: {
					before: async (account, context) => {
						const link = (await getOAuthState())?.link;

						// Someone else may have signed in on this browser meanwhile; their provider must
						// not join the account that started.
						if (link !== undefined && link.userId !== (await browserAccount(context))) {
							return false;
						}

						const added = await accountProviders(account.userId);

						// Two pages can start adding a provider before either of them added it.
						if (added.some(({ provider }) => provider === account.providerId)) {
							return false;
						}

						return { data: { ...account, ...NO_TOKENS } };
					},
					after: async (account) => {
						const provider = providerSchema.safeParse(account.providerId);
						const state = await getOAuthState();

						if (provider.success && state?.link !== undefined) {
							await noticeProvider(account.userId, provider.data);
						}
					},
				},
				update: {
					before: (account) => Promise.resolve({ data: { ...account, ...NO_TOKENS } }),
				},
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
						await signInEmail(
							localeSchema.catch(routing.defaultLocale).parse(metadata?.["locale"]),
							email,
							url,
						),
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
