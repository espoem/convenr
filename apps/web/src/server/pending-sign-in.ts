// A provider's sign-in that an email link has to finish. It waits in a short-lived cookie of the
// browser that signed in, signed with `AUTH_SECRET`, so it is in no address and no log, and only
// this server can have written the provider identity in it.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { providerSchema } from "@/domain/provider-address";
import { env } from "@/env";

import type { ProviderAnswer } from "./providers";

// `__Host-` keeps a sibling host from planting its own value; it needs a secure origin, so an
// instance served over plain HTTP uses the name without the prefix, as the browser key does.
const SECURE_NAME = "__Host-convenr-pending-sign-in";
const PLAIN_NAME = "convenr-pending-sign-in";

/** As long as the sign-in link the visitor asks for works, counted from the provider's answer. */
const LIFETIME_SECONDS = 15 * 60;

/** What Better Auth's callback reports when nobody is signed in because of the address. */
const CONFIRM_ERRORS = new Set(["address_not_proved", "account_not_linked"]);

/** Whether a sign-in through a provider can be finished by confirming the address. */
export function asksToConfirm(error: string): boolean {
	return CONFIRM_ERRORS.has(error);
}

const identitySchema = z.object({
	provider: providerSchema,
	subject: z.string().min(1),
	/** The address to fill in, or an empty one. */
	address: z.union([z.email(), z.literal("")]),
	/** Epoch milliseconds of the provider's answer; sending a link does not renew it. */
	startedAt: z.number().int(),
});

const pendingSchema = z.discriminatedUnion("kind", [
	identitySchema.extend({ kind: z.literal("asked") }),
	identitySchema.extend({
		kind: z.literal("sent"),
		/** Where the link went, lower-cased as Better Auth keeps addresses. */
		to: z.email(),
		/** Epoch milliseconds of sending the link. */
		sentAt: z.number().int(),
		/** The hash of the key in the link, so the cookie alone does not hold the key. */
		keyHash: z.string().min(1),
	}),
]);

export type PendingSignIn = z.infer<typeof pendingSchema>;

// A separate purpose in the signature keeps this value from passing for any other.
function signature(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(`pending-sign-in\n${payload}`).digest("base64url");
}

function hashOf(key: string): string {
	return createHash("sha256").update(key).digest("base64url");
}

function sameText(expected: string, actual: string): boolean {
	const left = Buffer.from(expected);
	const right = Buffer.from(actual);

	return left.length === right.length && timingSafeEqual(left, right);
}

/** The signed cookie value of `pending`. */
export function pendingValue(pending: PendingSignIn, secret: string): string {
	const payload = Buffer.from(JSON.stringify(pending)).toString("base64url");

	return `${payload}.${signature(payload, secret)}`;
}

function secondsLeft(pending: PendingSignIn, now: Temporal.Instant): number {
	return LIFETIME_SECONDS - (now.epochMilliseconds - pending.startedAt) / 1000;
}

/** What `value` holds, or `undefined` when it is malformed, not signed with `secret` or old. */
export function readPendingValue(
	value: string,
	secret: string,
	now: Temporal.Instant,
): PendingSignIn | undefined {
	const [payload, given, ...rest] = value.split(".");

	if (
		payload === undefined ||
		given === undefined ||
		rest.length > 0 ||
		!sameText(signature(payload, secret), given)
	) {
		return undefined;
	}

	// The signature matched, so this server wrote the payload and it is valid JSON.
	const pending = pendingSchema.safeParse(
		JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
	).data;

	if (pending === undefined) {
		return undefined;
	}

	const left = secondsLeft(pending, now);

	return left >= 0 && left <= LIFETIME_SECONDS ? pending : undefined;
}

/** A new key for the link the confirm page sends; only its hash goes into the cookie. */
export function newLinkKey(): string {
	return randomBytes(32).toString("base64url");
}

/** Whether `key`, from the address the link returned to, is the key of the link that was sent. */
export function followsLink(
	pending: PendingSignIn,
	key: string,
): pending is Extract<PendingSignIn, { kind: "sent" }> {
	return pending.kind === "sent" && sameText(pending.keyHash, hashOf(key));
}

type Settings = { secret: string; name: string; secure: boolean };

function settings(): Settings | undefined {
	const { accounts } = env();

	if (accounts.kind === "off") {
		return undefined;
	}

	const secure = accounts.publicUrl.protocol === "https:";

	return { secret: accounts.secret, name: secure ? SECURE_NAME : PLAIN_NAME, secure };
}

async function write(current: Settings, value: string, maxAge: number): Promise<void> {
	(await cookies()).set(current.name, value, {
		httpOnly: true,
		sameSite: "lax",
		secure: current.secure,
		path: "/",
		maxAge,
	});
}

async function keep(pending: PendingSignIn): Promise<void> {
	const current = settings();

	if (current !== undefined) {
		const maxAge = Math.floor(secondsLeft(pending, Temporal.Now.instant()));

		await write(current, pendingValue(pending, current.secret), maxAge);
	}
}

/** Keeps a provider's answer for the confirm page, replacing any earlier one. */
export async function keepPendingSignIn(answer: ProviderAnswer): Promise<void> {
	await keep({
		kind: "asked",
		provider: answer.provider,
		subject: answer.subject,
		address: answer.address.kind === "missing" ? "" : answer.address.email,
		startedAt: Temporal.Now.instant().epochMilliseconds,
	});
}

/** The pending sign-in of this browser, if there is one. */
export async function pendingSignIn(): Promise<PendingSignIn | undefined> {
	const current = settings();
	const value = current === undefined ? undefined : (await cookies()).get(current.name)?.value;

	return current === undefined || value === undefined
		? undefined
		: readPendingValue(value, current.secret, Temporal.Now.instant());
}

/** Notes that the confirm page sent a sign-in link with `key` to `to`. */
export async function markLinkSent(pending: PendingSignIn, to: string, key: string): Promise<void> {
	await keep({
		kind: "sent",
		provider: pending.provider,
		subject: pending.subject,
		address: pending.address,
		startedAt: pending.startedAt,
		to: to.toLowerCase(),
		sentAt: Temporal.Now.instant().epochMilliseconds,
		keyHash: hashOf(key),
	});
}

export async function forgetPendingSignIn(): Promise<void> {
	const current = settings();

	// A browser drops a `__Host-` cookie only for a deletion with the same attributes.
	if (current !== undefined) {
		await write(current, "", 0);
	}
}
