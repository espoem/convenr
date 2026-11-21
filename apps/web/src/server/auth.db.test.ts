import { createHmac } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { authSessions } from "@/db/schema";

import { type Auth, auth } from "./auth";

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

beforeAll(async () => {
	const configured = auth();

	if (configured === undefined) {
		throw new Error("The database tests run with accounts on.");
	}

	instance = configured;

	const context = await instance.$context;

	const user = await context.internalAdapter.createUser(
		{ email: `${crypto.randomUUID()}@example.org`, name: "", emailVerified: true },
		{ method: "magic-link" },
	);

	const session = await context.internalAdapter.createSession(user.id);

	const [stored] = await db()
		.select({ token: authSessions.token })
		.from(authSessions)
		.where(eq(authSessions.id, session.id));

	token = stored?.token ?? "";
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
