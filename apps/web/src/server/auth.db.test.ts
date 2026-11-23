import { createHmac } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { accountSettings, authSessions, authUsers, events } from "@/db/schema";

import { type Auth, auth } from "./auth";
import { createEvent } from "./events";
import { pragueEvenings } from "./test-events";

// Better Auth keeps the session token as it is; what protects it is the signature in the
// cookie, made with AUTH_SECRET. A copy of the database alone must not sign anyone in.
const SECRET = "test-secret-that-is-long-enough-for-accounts";
const COOKIE = "convenr.session_token";

function signed(token: string, secret: string): string {
	const signature = createHmac("sha256", secret).update(token).digest("base64");

	return encodeURIComponent(`${token}.${signature}`);
}

let instance: Auth;
let token: string;

/** The stored token of a new session of account `accountId`, as signing in creates it. */
async function newSession(accountId: string): Promise<string> {
	const context = await instance.$context;
	const session = await context.internalAdapter.createSession(accountId);

	const [stored] = await db()
		.select({ token: authSessions.token })
		.from(authSessions)
		.where(eq(authSessions.id, session.id));

	return stored?.token ?? "";
}

/** A new account, signed in by a fresh session, with the headers its browser sends. */
async function signedInAccount() {
	const context = await instance.$context;

	const user = await context.internalAdapter.createUser(
		{ email: `${crypto.randomUUID()}@example.org`, name: "", emailVerified: true },
		{ method: "magic-link" },
	);

	const sessionToken = await newSession(user.id);

	return { id: user.id, token: sessionToken, headers: headersFor(sessionToken) };
}

function headersFor(sessionToken: string): Headers {
	return new Headers({ cookie: `${COOKIE}=${signed(sessionToken, SECRET)}` });
}

beforeAll(async () => {
	const configured = auth();

	if (configured === undefined) {
		throw new Error("The database tests run with accounts on.");
	}

	instance = configured;
	token = (await signedInAccount()).token;
});

async function sessionFor(cookie: string) {
	return instance.api.getSession({ headers: new Headers({ cookie: `${COOKIE}=${cookie}` }) });
}

describe("a session cookie", () => {
	it("signs in when signed with the instance secret", async () => {
		expect(await sessionFor(signed(token, SECRET))).not.toBeNull();
	});

	it("does not sign in with the token from the database alone", async () => {
		expect(await sessionFor(encodeURIComponent(token))).toBeNull();
	});

	it("does not sign in when signed with another secret", async () => {
		expect(await sessionFor(signed(token, "another-secret-that-is-just-as-long-as-it"))).toBeNull();
	});
});

describe("signed-in browsers", () => {
	it("are signed out one by one, or all but the one that asks", async () => {
		const account = await signedInAccount();
		const second = await newSession(account.id);
		const third = await newSession(account.id);

		await instance.api.revokeSession({ body: { token: second }, headers: account.headers });
		expect(await instance.api.getSession({ headers: headersFor(second) })).toBeNull();
		expect(await instance.api.getSession({ headers: headersFor(third) })).not.toBeNull();

		await instance.api.revokeOtherSessions({ headers: account.headers });
		expect(await instance.api.getSession({ headers: headersFor(third) })).toBeNull();
		expect(await instance.api.getSession({ headers: account.headers })).not.toBeNull();
	});
});

describe("deleting an account", () => {
	it("takes its sessions and settings, and leaves its events without an owner", async () => {
		const account = await signedInAccount();

		await db().insert(accountSettings).values({ accountId: account.id, locale: "cs" });

		const created = await createEvent(pragueEvenings, Temporal.Now.instant(), {
			kind: "account",
			accountId: account.id,
		});

		if (!created.ok) {
			throw new Error("The test event is invalid.");
		}

		await instance.api.deleteUser({ body: {}, headers: account.headers });

		expect(await instance.api.getSession({ headers: account.headers })).toBeNull();
		expect(
			await db().select().from(authSessions).where(eq(authSessions.userId, account.id)),
		).toEqual([]);
		expect(
			await db().select().from(accountSettings).where(eq(accountSettings.accountId, account.id)),
		).toEqual([]);

		const [event] = await db()
			.select({ ownerId: events.ownerId })
			.from(events)
			.where(eq(events.id, created.event.id));

		expect(event).toEqual({ ownerId: null });
	});

	it("is refused to a session older than a day", async () => {
		const account = await signedInAccount();

		// Better Auth's tables hold `Date` values, so the session is aged in SQL.
		await db().execute(
			sql`update auth_sessions set created_at = now() - interval '2 days', updated_at = now() - interval '2 days' where token = ${account.token}`,
		);

		await expect(
			instance.api.deleteUser({ body: {}, headers: account.headers }),
		).rejects.toMatchObject({ body: { code: "SESSION_EXPIRED" } });
		expect(
			await db().select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.id, account.id)),
		).toEqual([{ id: account.id }]);
	});
});
