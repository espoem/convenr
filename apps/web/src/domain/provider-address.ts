// The sign-in providers and what each one's answer says about the person's email address
// (ADR 0012). Only these functions decide whether an address is proved.
import { z } from "zod";

export const PROVIDERS = ["google", "github"] as const;

export type Provider = (typeof PROVIDERS)[number];

/** The providers' own names, which are the same in every language. */
export const PROVIDER_NAMES: Readonly<Record<Provider, string>> = {
	google: "Google",
	github: "GitHub",
};

export type ProviderAddress =
	| { kind: "proved"; email: string }
	| { kind: "unproved"; email: string }
	| { kind: "missing" };

const googleSchema = z.object({
	email: z.email(),
	email_verified: z.boolean().default(false),
	hd: z.string().default(""),
});

/** What the decision reads of Google's claims, none of which is certain to be there. */
type GoogleClaims = {
	email?: string | undefined;
	email_verified?: boolean | undefined;
	hd?: string | undefined;
};

/**
 * Google is authoritative for its own addresses and for those of the domains it hosts. Any other
 * verified address may have changed hands since Google checked it.
 */
export function googleAddress(claims: GoogleClaims): ProviderAddress {
	const parsed = googleSchema.safeParse(claims);

	if (!parsed.success) {
		return { kind: "missing" };
	}

	const { email, email_verified: verified, hd } = parsed.data;

	const authoritative = verified && (hd !== "" || email.toLowerCase().endsWith("@gmail.com"));

	return { kind: authoritative ? "proved" : "unproved", email };
}

export const githubEmailsSchema = z.array(
	z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }),
);

/** GitHub's own forwarding addresses, which receive no mail. */
const GITHUB_NOREPLY = "@users.noreply.github.com";

/**
 * The primary address of a GitHub account; its public profile address is ignored. GitHub proves
 * no address: it verifies one once and never again, so its mark can belong to a former holder.
 */
export function githubAddress(emails: z.infer<typeof githubEmailsSchema>): ProviderAddress {
	const email = z.email().safeParse(emails.find((each) => each.primary)?.email);

	if (!email.success || email.data.toLowerCase().endsWith(GITHUB_NOREPLY)) {
		return { kind: "missing" };
	}

	return { kind: "unproved", email: email.data };
}

/**
 * The address Better Auth is given. It looks every address up before it creates an account, and
 * it refuses a sign-in without one, so an address nobody proved is replaced by a placeholder that
 * belongs to no account. The reserved domain receives no mail, so nobody can ever prove it.
 */
export function authAddress(
	provider: Provider,
	subject: string,
	address: ProviderAddress,
): { email: string; emailVerified: boolean } {
	return address.kind === "proved"
		? { email: address.email, emailVerified: true }
		: { email: `${subject}@${provider}.invalid`, emailVerified: false };
}
