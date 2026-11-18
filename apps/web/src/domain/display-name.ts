export const DISPLAY_NAME_MAX_LENGTH = 40;

export type DisplayNameResult =
	| { ok: true; name: string; key: string }
	| { ok: false; reason: "empty" | "too_long" | "control_character" };

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Number of user-perceived characters, so an emoji or a letter with an accent counts once. */
export function characterCount(text: string): number {
	return [...graphemes.segment(text)].length;
}

/**
 * Normalizes a display name and derives the key that decides whether two names are the same.
 * Control characters are refused: they cannot be typed in the join form and would make
 * two names look equal while comparing as different.
 */
export function parseDisplayName(raw: string): DisplayNameResult {
	const name = raw.trim().replaceAll(/\s+/gu, " ").normalize("NFC");

	if (name === "") {
		return { ok: false, reason: "empty" };
	}

	if (/\p{Cc}/u.test(name)) {
		return { ok: false, reason: "control_character" };
	}

	if (characterCount(name) > DISPLAY_NAME_MAX_LENGTH) {
		return { ok: false, reason: "too_long" };
	}

	return { ok: true, name, key: name.toLowerCase().normalize("NFC") };
}
