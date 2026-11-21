// The browser key of ADR 0008: one HttpOnly cookie from which each event's participant token is
// derived, so the server knows who a browser joined as without storing anything that ties two
// events of one browser together.
import { createHmac, randomBytes } from "node:crypto";

import { cookies, headers } from "next/headers";

import { SECRET_PREFIXES } from "./secrets";

const KEY_BYTES = 32;
const LIFETIME_SECONDS = 400 * 24 * 60 * 60;

// `__Host-` needs a secure origin. An instance served over plain HTTP, as a self-hosted one may
// be, gets a cookie without the prefix, and a secure one reads only the prefixed cookie, so a
// cookie planted over HTTP never counts there.
const SECURE_NAME = "__Host-convenr-key";
const PLAIN_NAME = "convenr-key";

const KEY_PATTERN = /^[\w-]{43}$/u;

/** The key and the UTC day it was last renewed, as the cookie holds them: `<key>.<date>`. */
export type BrowserKey = { key: string; renewedOn: Temporal.PlainDate };

function today(): Temporal.PlainDate {
	return Temporal.Now.plainDateISO("UTC");
}

/** Reads the cookie's value; anything that is not a key and a date reads as no key. */
export function parseBrowserKey(value: string | undefined): BrowserKey | undefined {
	const [key, date, ...rest] = value?.split(".") ?? [];

	if (key === undefined || date === undefined || rest.length > 0 || !KEY_PATTERN.test(key)) {
		return undefined;
	}

	try {
		return { key, renewedOn: Temporal.PlainDate.from(date, { overflow: "reject" }) };
	} catch {
		return undefined;
	}
}

export function formatBrowserKey({ key, renewedOn }: BrowserKey): string {
	return `${key}.${renewedOn.toString()}`;
}

/** The participant token of `eventId` for the browser that holds `key`. */
export function browserToken(key: string, eventId: string): string {
	const mac = createHmac("sha256", Buffer.from(key, "base64url"))
		.update(eventId)
		.digest("base64url");

	return `${SECRET_PREFIXES.participant}${mac}`;
}

/**
 * The request header in which the proxy states whether the request came over HTTPS. The proxy
 * always overwrites it, so a client cannot choose it.
 */
export const SECURE_HEADER = "x-convenr-secure";

export function cookieName(secure: boolean): string {
	return secure ? SECURE_NAME : PLAIN_NAME;
}

/** The options of the cookie, also used by the proxy that renews it. */
export function cookieOptions(secure: boolean) {
	return {
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/",
		maxAge: LIFETIME_SECONDS,
	} as const;
}

/** Whether the key was last renewed before today. */
export function needsRenewal(stored: BrowserKey): boolean {
	return Temporal.PlainDate.compare(stored.renewedOn, today()) < 0;
}

export function renewed(stored: BrowserKey): BrowserKey {
	return { key: stored.key, renewedOn: today() };
}

async function requestIsSecure(): Promise<boolean> {
	return (await headers()).get(SECURE_HEADER) === "1";
}

async function storedKey(): Promise<BrowserKey | undefined> {
	const secure = await requestIsSecure();

	return parseBrowserKey((await cookies()).get(cookieName(secure))?.value);
}

/** The token this browser holds for `eventId`, or `undefined` when it has no key. */
export async function heldToken(eventId: string): Promise<string | undefined> {
	const stored = await storedKey();

	return stored === undefined ? undefined : browserToken(stored.key, eventId);
}

/**
 * The token this browser holds for `eventId`, creating the key first when it has none. Only a
 * Server Action may call it, because only an action can set a cookie.
 */
export async function ensureToken(eventId: string): Promise<string> {
	const stored = await storedKey();

	if (stored !== undefined) {
		return browserToken(stored.key, eventId);
	}

	const secure = await requestIsSecure();
	const created = { key: randomBytes(KEY_BYTES).toString("base64url"), renewedOn: today() };

	(await cookies()).set(cookieName(secure), formatBrowserKey(created), cookieOptions(secure));

	return browserToken(created.key, eventId);
}
