// The value an unsubscribe link carries: the account, the event and the kind, signed with
// `AUTH_SECRET`, and nothing else. Anyone holding the email can turn that kind off for that
// event, and nothing more.
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { NOTIFICATION_KINDS, type NotificationKind } from "@/domain/notifications";

export type Unsubscription = { accountId: string; eventId: string; kind: NotificationKind };

// A separate purpose in the signature keeps this value from passing for any other.
function signature(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(`unsubscribe\n${payload}`).digest("base64url");
}

/** The signed value for `unsubscription`. */
export function unsubscribeValue(unsubscription: Unsubscription, secret: string): string {
	const { accountId, eventId, kind } = unsubscription;
	const payload = Buffer.from(JSON.stringify([accountId, eventId, kind])).toString("base64url");

	return `${payload}.${signature(payload, secret)}`;
}

const payloadSchema = z.tuple([z.string(), z.string(), z.enum(NOTIFICATION_KINDS)]);

/** What `value` names, or `undefined` when it is malformed or not signed with `secret`. */
export function readUnsubscribeValue(value: string, secret: string): Unsubscription | undefined {
	const [payload, given, ...rest] = value.split(".");

	if (payload === undefined || given === undefined || rest.length > 0) {
		return undefined;
	}

	const expected = Buffer.from(signature(payload, secret));
	const actual = Buffer.from(given);

	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
		return undefined;
	}

	// The signature matched, so this server wrote the payload and it is valid JSON.
	const parsed = payloadSchema.safeParse(
		JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
	);

	if (!parsed.success) {
		return undefined;
	}

	const [accountId, eventId, kind] = parsed.data;

	return { accountId, eventId, kind };
}
