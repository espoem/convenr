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

/** Who a provider said signed in, as Better Auth keys the provider's row of an account. */
export type ProviderAnswer = { provider: Provider; subject: string; address: ProviderAddress };

type Answer = { kind: "none" } | ({ kind: "answered" } & ProviderAnswer);

/** The answer of one request, which the provider's code fills in. */
type AnswerSlot = { answer: Answer };

declare global {
	var convenrProviderAnswer: AsyncLocalStorage<AnswerSlot> | undefined;
}

// Better Auth is made once for the whole server, but each bundle has its own copy of this module:
// the copy that made it and the copy that asks must share the storage.
const answered = (globalThis.convenrProviderAnswer ??= new AsyncLocalStorage<AnswerSlot>());

/**
 * Runs `handle` and returns its result with what a provider answered meanwhile. The answer
 * reaches the visitor's own browser when the sign-in has to be finished by an email link.
 */
export async function withProviderAnswer<Result>(
	handle: () => Promise<Result>,
): Promise<{ result: Result; answer: Answer }> {
	const store: AnswerSlot = { answer: { kind: "none" } };
	const result = await answered.run(store, handle);

	return { result, answer: store.answer };
}

/** What a visitor goes to a provider for. */
export const PROVIDER_PURPOSES = ["sign_in", "add"] as const;

export type ProviderPurpose = (typeof PROVIDER_PURPOSES)[number];

/** The providers a visitor can sign in through on this instance. */
export function offeredProviders(): Provider[] {
	const { accounts } = env();

	return accounts.kind === "off" ? [] : accounts.providers.map(({ provider }) => provider);
}

/** The user Better Auth works with; it never sees a name, a picture or an unproved address. */
function authUser(provider: Provider, subject: string, address: ProviderAddress) {
	const store = answered.getStore();

	if (store !== undefined) {
		store.answer = { kind: "answered", provider, subject, address };
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

		const answer: unknown = await user.json();
		const profile = githubUserSchema.parse(answer);
		// GitHub's id is a number, whatever Better Auth's type says; the row keeps it as text.
		const { id } = githubIdSchema.parse(answer);
		const listed = githubEmailsSchema.parse(await emails.json());

		return {
			user: authUser("github", String(id), githubAddress(listed)),
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
