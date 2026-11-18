// Admin secrets and participant tokens by ADR 0003, items 2 to 4, in the typed format of
// ADR 0004 item 1.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_BYTES = 32;

export type SecretKind = "admin" | "participant";

/** The prefix that names a secret's kind, so clients, log filters and scanners can tell them apart. */
export const SECRET_PREFIXES = { admin: "cva_", participant: "cvp_" } as const satisfies Record<
	SecretKind,
	string
>;

/** The kind's prefix followed by 32 random bytes from the operating system, base64url. */
export function newSecret(kind: SecretKind): string {
	return `${SECRET_PREFIXES[kind]}${randomBytes(SECRET_BYTES).toString("base64url")}`;
}

/** The kind `secret` names by its prefix, or `undefined` when it has neither prefix. */
export function secretKind(secret: string): SecretKind | undefined {
	const kinds: SecretKind[] = ["admin", "participant"];

	return kinds.find((kind) => secret.startsWith(SECRET_PREFIXES[kind]));
}

/**
 * SHA-256 of a whole secret, prefix included, base64url. A secret is long and random, so a
 * fast hash suffices, and a stored hash is looked up by equality.
 */
export function hashSecret(secret: string): string {
	return createHash("sha256").update(secret).digest("base64url");
}

/** Whether `secret` hashes to `storedHash`, compared in constant time. */
export function matchesSecret(storedHash: string, secret: string): boolean {
	const stored = Buffer.from(storedHash);
	const given = Buffer.from(hashSecret(secret));

	return stored.length === given.length && timingSafeEqual(stored, given);
}
