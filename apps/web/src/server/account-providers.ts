// The providers an account signs in through, as its page lists them.
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { authAccounts } from "@/db/schema";
import { type Provider, PROVIDERS, providerSchema } from "@/domain/provider-address";

export type AccountProvider = { id: string; provider: Provider; addedAt: Date };

/** The providers added to an account, the earliest first. */
export async function accountProviders(accountId: string): Promise<AccountProvider[]> {
	const rows = await db()
		.select({
			id: authAccounts.id,
			provider: authAccounts.providerId,
			addedAt: authAccounts.createdAt,
		})
		.from(authAccounts)
		.where(and(eq(authAccounts.userId, accountId), inArray(authAccounts.providerId, PROVIDERS)))
		.orderBy(authAccounts.createdAt);

	return rows.map(({ id, provider, addedAt }) => ({
		id,
		provider: providerSchema.parse(provider),
		addedAt,
	}));
}
