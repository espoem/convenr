// The sign-in providers as Better Auth takes them (ADR 0012): the least scopes, and an address
// only where the provider proves it.
import { AsyncLocalStorage } from "node:async_hooks";

import type { BetterAuthOptions } from "better-auth";
import type { GithubProfile } from "better-auth/social-providers";
import { z } from "zod";

import {
	authAddress,
	githubAddress,
	githubEmailsSchema,
	googleAddress,
	type Provider,
	type ProviderAddress,
} from "@/domain/provider-address";
import { env, type ProviderSettings } from "@/env";

/** Milliseconds a visitor waits for one answer of a provider at most. */
const PROVIDER_TIMEOUT = 10_000;

type Answer = { address: ProviderAddress };

declare global {
	var convenrProviderAnswer: AsyncLocalStorage<Answer> | undefined;
}

// Better Auth is made once for the whole server, but each bundle has its own copy of this module:
// the copy that made it and the copy that asks must share the storage.
const answered = (globalThis.convenrProviderAnswer ??= new AsyncLocalStorage<Answer>());

/**
 * Runs `handle` and returns its result with the address a provider named meanwhile. The address
 * reaches the visitor's own browser when the sign-in has to be finished by an email link.
 */
export async function withProviderAddress<Result>(
	handle: () => Promise<Result>,
): Promise<{ result: Result; address: ProviderAddress }> {
	const store: Answer = { address: { kind: "missing" } };
	const result = await answered.run(store, handle);

	return { result, address: store.address };
}

/** The providers a visitor can sign in through on this instance. */
export function offeredProviders(): Provider[] {
	const { accounts } = env();

	return accounts.kind === "off" ? [] : accounts.providers.map(({ provider }) => provider);
}

/** The user Better Auth works with; it never sees a name, a picture or an unproved address. */
function authUser(provider: Provider, subject: string, address: ProviderAddress) {
	const store = answered.getStore();

	if (store !== undefined) {
		store.address = address;
	}

	return { ...authAddress(provider, subject, address), name: "" };
}

async function askGithub(path: string, accessToken: string): Promise<Response> {
	return fetch(`https://api.github.com${path}`, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"User-Agent": "convenr",
		},
		signal: AbortSignal.timeout(PROVIDER_TIMEOUT),
	});
}

const githubIdSchema = z.object({ id: z.number().int() });

// Better Auth wants GitHub's whole answer; convenr reads its id only.
const githubUserSchema = z.custom<GithubProfile>(
	(answer) => githubIdSchema.safeParse(answer).success,
);

async function githubUser(accessToken: string) {
	try {
		const [user, emails] = await Promise.all([
			askGithub("/user", accessToken),
			askGithub("/user/emails", accessToken),
		]);

		// An account without an address gets an empty list; a refusal means GitHub failed.
		if (!emails.ok) {
			return null;
		}

		const profile = githubUserSchema.parse(await user.json());
		const listed = githubEmailsSchema.parse(await emails.json());

		return {
			user: authUser("github", profile.id, githubAddress(listed)),
			data: profile,
		};
	} catch {
		// Better Auth reports a missing answer as a failed sign-in.
		return null;
	}
}

/** Better Auth's settings of the providers that are on. */
export function socialProviders(
	settings: readonly ProviderSettings[],
): NonNullable<BetterAuthOptions["socialProviders"]> {
	const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};

	for (const { provider, clientId, clientSecret } of settings) {
		const common = {
			clientId,
			clientSecret,
			disableDefaultScope: true,
			disableIdTokenSignIn: true,
		};

		if (provider === "google") {
			providers.google = {
				...common,
				scope: ["openid", "email"],
				includeGrantedScopes: false,
				mapProfileToUser: (claims) => authUser("google", claims.sub, googleAddress(claims)),
			};
		} else {
			providers.github = {
				...common,
				scope: ["user:email"],
				getUserInfo: async ({ accessToken }) =>
					accessToken === undefined ? null : githubUser(accessToken),
			};
		}
	}

	return providers;
}
