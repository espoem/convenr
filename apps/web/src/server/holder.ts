// Whom a page request or Server Action speaks for in an event (ADR 0008, ADR 0009).

import { heldToken } from "./browser-key";
import type { Holder } from "./event-rows";
import { isLinkedIn } from "./participants";
import { currentVisitor } from "./session";

/**
 * The signed-in account when it has a participant in `eventId`, otherwise the token the
 * browser's key gives, or `undefined` when the browser has no key.
 */
export async function currentHolder(eventId: string): Promise<Holder | undefined> {
	const visitor = await currentVisitor();

	if (visitor.kind === "signed_in" && (await isLinkedIn(eventId, visitor.accountId))) {
		return { kind: "account", accountId: visitor.accountId };
	}

	const token = await heldToken(eventId);

	return token === undefined ? undefined : { kind: "token", token };
}
