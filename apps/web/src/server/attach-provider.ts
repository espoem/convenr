// Finishes a provider's sign-in that an email link confirmed: the provider joins the account the
// link signed in to, but only in the browser that signed in at the provider, and only when the
// link went to that account's address after the provider's sign-in.
import { generateId } from "better-auth";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { authAccounts } from "@/db/schema";

import type { PendingSignIn } from "./pending-sign-in";

export type SignedInAccount = {
	accountId: string;
	email: string;
	sessionCreatedAt: Temporal.Instant;
};

export type AttachOutcome =
	| { kind: "attached" }
	| { kind: "in_other_account" }
	/** Nothing to do: no matching link, or the account has the provider already. */
	| { kind: "skipped" };

/** Whether the link that signed `account` in is the one the confirm page sent. */
function linkMatches(pending: PendingSignIn, account: SignedInAccount): boolean {
	return (
		pending.kind === "sent" &&
		pending.to === account.email.toLowerCase() &&
		account.sessionCreatedAt.epochMilliseconds >= pending.sentAt
	);
}

/** Adds the pending provider identity to the signed-in account when the link matches. */
export async function attachPendingProvider(
	pending: PendingSignIn,
	account: SignedInAccount,
): Promise<AttachOutcome> {
	if (!linkMatches(pending, account)) {
		return { kind: "skipped" };
	}

	// The two unique constraints decide: an identity is in one account, a provider once in each.
	const inserted = await db()
		.insert(authAccounts)
		.values({
			id: generateId(),
			providerId: pending.provider,
			accountId: pending.subject,
			userId: account.accountId,
		})
		.onConflictDoNothing()
		.returning({ id: authAccounts.id });

	if (inserted.length > 0) {
		return { kind: "attached" };
	}

	const [owner] = await db()
		.select({ userId: authAccounts.userId })
		.from(authAccounts)
		.where(
			and(
				eq(authAccounts.providerId, pending.provider),
				eq(authAccounts.accountId, pending.subject),
			),
		);

	return owner !== undefined && owner.userId !== account.accountId
		? { kind: "in_other_account" }
		: { kind: "skipped" };
}
