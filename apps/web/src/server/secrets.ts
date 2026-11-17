// Admin secrets and participant tokens by ADR 0003, items 2 to 4.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const SECRET_BYTES = 32;

/** 32 random bytes from the operating system, base64url. */
export function newSecret(): string {
	return randomBytes(SECRET_BYTES).toString("base64url");
}

/**
 * SHA-256 of a secret, base64url. A secret is long and random, so a fast hash suffices, and
 * a stored hash is looked up by equality.
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
