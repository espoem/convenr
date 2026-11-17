// ADR 0003: 12 characters from 57 that leave out 0, O, 1, l and I. About 70 bits.
export const EVENT_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const EVENT_ID_LENGTH = 12;

const eventIdPattern = new RegExp(`^[${EVENT_ID_ALPHABET}]{${EVENT_ID_LENGTH}}$`);

// The largest multiple of the alphabet size that fits in a byte. Bytes at or above it are
// discarded so that every character is equally likely.
const unbiasedLimit = 256 - (256 % EVENT_ID_ALPHABET.length);

export function newEventId(): string {
	let id = "";

	while (id.length < EVENT_ID_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(EVENT_ID_LENGTH))) {
			if (byte < unbiasedLimit && id.length < EVENT_ID_LENGTH) {
				id += EVENT_ID_ALPHABET.charAt(byte % EVENT_ID_ALPHABET.length);
			}
		}
	}

	return id;
}

export function isEventId(candidate: string): boolean {
	return eventIdPattern.test(candidate);
}
