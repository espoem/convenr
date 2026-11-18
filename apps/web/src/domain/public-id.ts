// Public ids of events and participants. ADR 0003: 12 characters from 57 that leave out 0, O,
// 1, l and I. About 70 bits.
export const PUBLIC_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const PUBLIC_ID_LENGTH = 12;

const publicIdPattern = new RegExp(`^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`, "u");

// The largest multiple of the alphabet size that fits in a byte. Bytes at or above it are
// discarded so that every character is equally likely.
const unbiasedLimit = 256 - (256 % PUBLIC_ID_ALPHABET.length);

export function newPublicId(): string {
	let id = "";

	while (id.length < PUBLIC_ID_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(PUBLIC_ID_LENGTH))) {
			if (byte < unbiasedLimit && id.length < PUBLIC_ID_LENGTH) {
				id += PUBLIC_ID_ALPHABET.charAt(byte % PUBLIC_ID_ALPHABET.length);
			}
		}
	}

	return id;
}

export function isPublicId(candidate: string): boolean {
	return publicIdPattern.test(candidate);
}
