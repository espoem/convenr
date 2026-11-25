// Sign-in through the providers with Better Auth's own provider code; only the network's answers
// come from here, in place of Google and GitHub.
import { createHmac } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { db } from "@/db/client";
import { accountSettings, authAccounts, authSessions, authUsers, emailCounts } from "@/db/schema";
import type { ProviderAddress } from "@/domain/provider-address";

import { type Auth, auth } from "./auth";
import { withProviderAddress } from "./providers";

const SECRET = "test-secret-that-is-long-enough-for-accounts";
const ORIGIN = "http://localhost:3000";

type Person = {
	id: string;
	email?: string;
	verified?: boolean;
	hd?: string;
	/** GitHub fails to list the addresses. */
	emailsFail?: boolean;
};

function base64url(text: string): string {
	return Buffer.from(text).toString("base64url");
}

/** An unsigned ID token: Better Auth reads the one Google's token endpoint sends as it is. */
function idToken({ id, email, verified, hd }: Person): string {
	const claims = {
		sub: id,
		email,
		email_verified: verified,
		hd,
		name: "Jana Nováková",
		picture: "https://example.org/jana.png",
	};

	return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(claims))}.`;
}

/** Answers every request of a sign-in as the provider would for `person`. */
function providersAnswerFor(person: Person) {
	vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
		const url = new URL(input instanceof Request ? input.url : input);

		switch (url.host + url.pathname) {
			case "oauth2.googleapis.com/token":
				return Promise.resolve(
					Response.json({
						access_token: "google-access",
						refresh_token: "google-refresh",
						id_token: idToken(person),
						expires_in: 3600,
						scope: "openid email",
						token_type: "Bearer",
					}),
				);
			case "github.com/login/oauth/access_token":
				return Promise.resolve(
					Response.json({
						access_token: "github-access",
						scope: "user:email",
						token_type: "bearer",
					}),
				);
			case "api.github.com/user":
				return Promise.resolve(
					Response.json({ id: Number(person.id), name: "Jana", avatar_url: "https://example.org" }),
				);
			case "api.github.com/user/emails":
				if (person.emailsFail === true) {
					return Promise.resolve(new Response(null, { status: 503 }));
				}

				return Promise.resolve(
					Response.json(
						person.email === undefined
							? []
							: [{ email: person.email, primary: true, verified: person.verified ?? false }],
					),
				);
			default:
				return Promise.reject(new Error(`Unexpected request to ${url.host}${url.pathname}`));
		}
	});
}

function instance(): Auth {
	const configured = auth();

	if (configured === undefined) {
		throw new Error("The database tests run with accounts on.");
	}

	return configured;
}

const started = z.object({ url: z.url() });

/** The cookies of a response as the browser sends them back. */
function cookiesOf(headers: Headers): string {
	return headers
		.getSetCookie()
		.map((cookie) => cookie.split(";")[0])
		.join("; ");
}

type Outcome = {
	location: string;
	error: string | null;
	cookies: string;
	address: ProviderAddress;
};

/** Follows the provider's redirect back to the callback. */
async function callBack(provider: string, authorization: URL, cookie: string): Promise<Outcome> {
	const callback = new URL(`${ORIGIN}/api/auth/callback/${provider}`);

	callback.searchParams.set("code", "the-code");
	callback.searchParams.set("state", authorization.searchParams.get("state") ?? "");

	const { result, address } = await withProviderAddress(() =>
		instance().handler(new Request(callback, { headers: { cookie } })),
	);

	const location = result.headers.get("location") ?? "";

	return {
		location,
		error: new URL(location, ORIGIN).searchParams.get("error"),
		cookies: cookiesOf(result.headers),
		address,
	};
}

async function signIn(provider: "google" | "github", person: Person): Promise<Outcome> {
	providersAnswerFor(person);

	const { response, headers } = await instance().api.signInSocial({
		body: {
			provider,
			callbackURL: "/cs/account",
			errorCallbackURL: "/cs/sign-in",
			disableRedirect: true,
		},
		returnHeaders: true,
	});

	return callBack(provider, new URL(started.parse(response).url), cookiesOf(headers));
}

/** Adds a provider from `session`; the browser returns signed in as `returning`. */
async function add(
	provider: "google" | "github",
	person: Person,
	session: Headers,
	returning = session,
): Promise<Outcome> {
	providersAnswerFor(person);

	const { response, headers } = await instance().api.linkSocialAccount({
		body: {
			provider,
			callbackURL: "/cs/account",
			errorCallbackURL: "/cs/account",
			disableRedirect: true,
		},
		headers: session,
		returnHeaders: true,
	});

	const cookies = `${cookiesOf(headers)}; ${returning.get("cookie") ?? ""}`;

	return callBack(provider, new URL(started.parse(response).url), cookies);
}

/** An account made by an email link, with the headers of a fresh session. */
async function emailAccount(email: string) {
	const context = await instance().$context;

	const user = await context.internalAdapter.createUser(
		{ email, name: "", emailVerified: true },
		{ method: "magic-link" },
	);

	const session = await context.internalAdapter.createSession(user.id);
	const signature = createHmac("sha256", SECRET).update(session.token).digest("base64");
	const value = encodeURIComponent(`${session.token}.${signature}`);

	return { id: user.id, headers: new Headers({ cookie: `convenr.session_token=${value}` }) };
}

async function accountsAt(email: string) {
	return db()
		.select({ id: authUsers.id, name: authUsers.name, image: authUsers.image })
		.from(authUsers)
		.where(eq(authUsers.email, email));
}

async function providersOf(accountId: string) {
	return db().select().from(authAccounts).where(eq(authAccounts.userId, accountId));
}

async function countAccounts(): Promise<number> {
	return db().$count(authUsers);
}

/** The account a sign-in's session cookie belongs to. */
async function signedInTo(cookies: string): Promise<string | undefined> {
	const session = await instance().api.getSession({ headers: new Headers({ cookie: cookies }) });

	return session?.user.id;
}

const unique = () => crypto.randomUUID();
const githubId = () => String(crypto.getRandomValues(new Uint32Array(1))[0]);

beforeEach(async () => {
	await db().delete(emailCounts);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("a first sign-in through a provider", () => {
	it("creates an account at an address Google proves, in the language of the page", async () => {
		const email = `${unique()}@gmail.com`;
		const outcome = await signIn("google", { id: unique(), email, verified: true });
		const [account] = await accountsAt(email);

		expect(outcome.location).toBe("/cs/account");
		expect(await signedInTo(outcome.cookies)).toBe(account?.id);
		expect(
			await db()
				.select({ locale: accountSettings.locale })
				.from(accountSettings)
				.where(eq(accountSettings.accountId, account?.id ?? "")),
		).toEqual([{ locale: "cs" }]);
	});

	it("creates no account at an address GitHub verified", async () => {
		const email = `${unique()}@example.org`;
		const outcome = await signIn("github", { id: githubId(), email, verified: true });

		expect(outcome.error).toBe("address_not_proved");
		expect(outcome.address).toEqual({ kind: "unproved", email });
		expect(await accountsAt(email)).toEqual([]);
	});

	it("keeps no token, scope, name or picture", async () => {
		const email = `${unique()}@gmail.com`;
		const id = unique();

		await signIn("google", { id, email, verified: true });
		await signIn("google", { id, email, verified: true });

		const [account] = await accountsAt(email);

		expect(account).toMatchObject({ name: "", image: null });
		expect(await providersOf(account?.id ?? "")).toEqual([
			expect.objectContaining({
				providerId: "google",
				accountId: id,
				accessToken: null,
				refreshToken: null,
				idToken: null,
				accessTokenExpiresAt: null,
				refreshTokenExpiresAt: null,
				scope: null,
			}),
		]);
	});

	it.each([
		["google", unique()],
		["github", githubId()],
	] as const)("creates nothing at an address %s does not prove", async (provider, id) => {
		const email = `${unique()}@example.org`;
		const before = await countAccounts();
		const outcome = await signIn(provider, { id, email, verified: false });

		expect(outcome.error).toBe("address_not_proved");
		expect(outcome.location).toMatch(/^\/cs\/sign-in\?/u);
		expect(outcome.location).not.toContain(email.split("@")[0]);
		expect(outcome.address).toEqual({ kind: "unproved", email });
		expect(await signedInTo(outcome.cookies)).toBeUndefined();
		expect(await countAccounts()).toBe(before);
	});

	it("answers the same at an unproved address whether or not it has an account", async () => {
		const email = `${unique()}@example.org`;
		const without = await signIn("google", { id: unique(), email, verified: true });
		const { id } = await emailAccount(email);
		const withAccount = await signIn("google", { id: unique(), email, verified: true });

		expect(withAccount.location).toBe(without.location);
		expect(await providersOf(id)).toEqual([]);
	});

	it("creates nothing without an address", async () => {
		const before = await countAccounts();
		const outcome = await signIn("github", { id: githubId() });

		expect(outcome.error).toBe("address_not_proved");
		expect(outcome.address).toEqual({ kind: "missing" });
		expect(await countAccounts()).toBe(before);
	});

	it("fails, instead of asking for the address, when GitHub cannot list the addresses", async () => {
		const before = await countAccounts();
		const outcome = await signIn("github", { id: githubId(), emailsFail: true });

		expect(outcome.error).toBe("unable_to_get_user_info");
		expect(await countAccounts()).toBe(before);
	});

	it("does not join an account that has the proved address", async () => {
		const email = `${unique()}@gmail.com`;
		const { id } = await emailAccount(email);
		const outcome = await signIn("google", { id: unique(), email, verified: true });

		expect(outcome.error).toBe("account_not_linked");
		expect(outcome.address).toEqual({ kind: "proved", email });
		expect(await signedInTo(outcome.cookies)).toBeUndefined();
		expect(await providersOf(id)).toEqual([]);
	});
});

describe("adding a provider from a session", () => {
	it("keeps the account's address, and the provider then signs in whatever its address", async () => {
		const email = `${unique()}@example.org`;
		const account = await emailAccount(email);
		const person = { id: githubId() };

		expect((await add("github", person, account.headers)).location).toBe("/cs/account");
		expect(await accountsAt(email)).toMatchObject([{ id: account.id }]);
		expect(await signedInTo((await signIn("github", person)).cookies)).toBe(account.id);

		const google = { id: unique(), email: `${unique()}@example.org`, verified: false };

		await add("google", google, account.headers);
		expect(await signedInTo((await signIn("google", google)).cookies)).toBe(account.id);
		expect(await accountsAt(email)).toMatchObject([{ id: account.id, name: "", image: null }]);
	});

	it("stores no token, also when the same identity is added again", async () => {
		const account = await emailAccount(`${unique()}@example.org`);
		const person = { id: unique(), email: `${unique()}@gmail.com`, verified: true };

		await add("google", person, account.headers);
		await add("google", person, account.headers);

		expect(await providersOf(account.id)).toEqual([
			expect.objectContaining({
				accessToken: null,
				refreshToken: null,
				idToken: null,
				scope: null,
			}),
		]);
	});

	it("is refused for an identity that is in another account", async () => {
		const first = await emailAccount(`${unique()}@example.org`);
		const second = await emailAccount(`${unique()}@example.org`);
		const person = { id: githubId(), email: `${unique()}@example.org`, verified: true };

		await add("github", person, first.headers);

		const outcome = await add("github", person, second.headers);

		expect(outcome.error).toBe("account_already_linked_to_different_user");
		expect(await providersOf(second.id)).toEqual([]);
	});

	it("is refused for a second identity of the same provider", async () => {
		const account = await emailAccount(`${unique()}@example.org`);
		const first = { id: githubId() };

		await add("github", first, account.headers);

		const outcome = await add("github", { id: githubId() }, account.headers);

		expect(outcome.error).toBe("unable_to_link_account");
		expect(await providersOf(account.id)).toMatchObject([{ accountId: first.id }]);
	});

	it("stores an identity once, and a provider once for an account", async () => {
		const first = await emailAccount(`${unique()}@example.org`);
		const second = await emailAccount(`${unique()}@example.org`);
		const row = { id: unique(), providerId: "github", accountId: githubId(), userId: first.id };

		await db().insert(authAccounts).values(row);

		await expect(
			db()
				.insert(authAccounts)
				.values({ ...row, id: unique(), userId: second.id }),
		).rejects.toMatchObject({ cause: { constraint: "auth_accounts_identity" } });

		await expect(
			db()
				.insert(authAccounts)
				.values({ ...row, id: unique(), accountId: githubId() }),
		).rejects.toMatchObject({ cause: { constraint: "auth_accounts_provider" } });
	});

	it("is refused when the browser is signed in to another account meanwhile", async () => {
		const first = await emailAccount(`${unique()}@example.org`);
		const second = await emailAccount(`${unique()}@example.org`);

		const outcome = await add("github", { id: githubId() }, first.headers, second.headers);

		expect(outcome.error).toBe("unable_to_link_account");
		expect(await providersOf(first.id)).toEqual([]);
		expect(await providersOf(second.id)).toEqual([]);
	});

	it("is refused when its session ended meanwhile", async () => {
		const account = await emailAccount(`${unique()}@example.org`);

		providersAnswerFor({ id: githubId() });

		const { response, headers } = await instance().api.linkSocialAccount({
			body: { provider: "github", callbackURL: "/cs/account", errorCallbackURL: "/cs/account" },
			headers: account.headers,
			returnHeaders: true,
		});

		await db().delete(authSessions).where(eq(authSessions.userId, account.id));

		const outcome = await callBack(
			"github",
			new URL(started.parse(response).url),
			cookiesOf(headers),
		);

		expect(outcome.error).not.toBeNull();
		expect(await providersOf(account.id)).toEqual([]);
	});

	it("counts one notice, which a new account does not get", async () => {
		const account = await emailAccount(`${unique()}@example.org`);

		await signIn("google", { id: unique(), email: `${unique()}@gmail.com`, verified: true });
		expect(await db().$count(emailCounts)).toBe(0);

		await add("github", { id: githubId() }, account.headers);
		expect(await db().$count(emailCounts)).toBe(1);
	});
});

describe("removing a provider", () => {
	it("is allowed for the last one, and the identity no longer signs in", async () => {
		const account = await emailAccount(`${unique()}@example.org`);
		const person = { id: githubId() };

		await add("github", person, account.headers);

		const [row] = await providersOf(account.id);

		await instance().api.unlinkAccount({
			body: { accountId: row?.id ?? "" },
			headers: account.headers,
		});

		expect(await providersOf(account.id)).toEqual([]);
		expect((await signIn("github", person)).error).toBe("address_not_proved");
	});

	it("is refused to a session older than a day and to another account", async () => {
		const account = await emailAccount(`${unique()}@example.org`);
		const other = await emailAccount(`${unique()}@example.org`);

		await add("github", { id: githubId() }, account.headers);

		const [row] = await providersOf(account.id);
		const body = { accountId: row?.id ?? "" };

		await expect(
			instance().api.unlinkAccount({ body, headers: other.headers }),
		).rejects.toMatchObject({ body: { code: "ACCOUNT_NOT_FOUND" } });

		await db().execute(
			sql`update auth_sessions set created_at = now() - interval '2 days', updated_at = now() - interval '2 days' where user_id = ${account.id}`,
		);

		await expect(
			instance().api.unlinkAccount({ body, headers: account.headers }),
		).rejects.toMatchObject({ body: { code: "SESSION_NOT_FRESH" } });
		expect(await providersOf(account.id)).toHaveLength(1);
	});
});

describe("the provider endpoints", () => {
	it.each([
		"/sign-in/social",
		"/link-social",
		"/link-social/",
		"/unlink-account",
		"/get-access-token",
		"/refresh-token",
	])("answer not found at %s, also to a signed-in browser", async (path) => {
		const { headers } = await emailAccount(`${unique()}@example.org`);

		headers.set("content-type", "application/json");
		headers.set("origin", ORIGIN);

		const request = new Request(`${ORIGIN}/api/auth${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify({ provider: "google", callbackURL: "/cs/account" }),
		});

		expect((await instance().handler(request)).status).toBe(404);
	});

	it("refuse a callback that no sign-in of this browser started", async () => {
		providersAnswerFor({ id: unique(), email: `${unique()}@gmail.com`, verified: true });

		const before = await countAccounts();

		const { response } = await instance().api.signInSocial({
			body: { provider: "google", callbackURL: "/cs/account", errorCallbackURL: "/cs/sign-in" },
			returnHeaders: true,
		});

		const outcome = await callBack("google", new URL(started.parse(response).url), "");

		expect(outcome.error).toBe("state_mismatch");
		expect(await countAccounts()).toBe(before);
	});
});
