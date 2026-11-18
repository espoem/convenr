export const SLUG_MAX_LENGTH = 60;

// Letters that Unicode decomposition does not reduce to ASCII. Keys are lower case.
const latin = new Map([
	["ß", "ss"],
	["æ", "ae"],
	["œ", "oe"],
	["ø", "o"],
	["ł", "l"],
	["đ", "d"],
	["ð", "d"],
	["þ", "th"],
	["ı", "i"],
	["ħ", "h"],
	["ŧ", "t"],
	["ŋ", "ng"],
	["ĸ", "k"],
	["ſ", "s"],
]);

// Cyrillic letters of Russian, Ukrainian, Belarusian, Bulgarian, Serbian and Macedonian.
// Listed before decomposition so that й, ё, ї and ў keep their own spelling.
const cyrillic = new Map([
	["а", "a"],
	["б", "b"],
	["в", "v"],
	["г", "g"],
	["ґ", "g"],
	["д", "d"],
	["ђ", "dj"],
	["ѓ", "gj"],
	["е", "e"],
	["ё", "yo"],
	["є", "ye"],
	["ж", "zh"],
	["з", "z"],
	["ѕ", "dz"],
	["и", "i"],
	["і", "i"],
	["ї", "yi"],
	["й", "y"],
	["ј", "j"],
	["к", "k"],
	["ќ", "kj"],
	["л", "l"],
	["љ", "lj"],
	["м", "m"],
	["н", "n"],
	["њ", "nj"],
	["о", "o"],
	["п", "p"],
	["р", "r"],
	["с", "s"],
	["т", "t"],
	["ћ", "c"],
	["у", "u"],
	["ў", "u"],
	["ф", "f"],
	["х", "kh"],
	["ц", "ts"],
	["ч", "ch"],
	["џ", "dz"],
	["ш", "sh"],
	["щ", "shch"],
	["ъ", ""],
	["ы", "y"],
	["ь", ""],
	["э", "e"],
	["ю", "yu"],
	["я", "ya"],
]);

// Greek letters after their accents are removed.
const greek = new Map([
	["α", "a"],
	["β", "v"],
	["γ", "g"],
	["δ", "d"],
	["ε", "e"],
	["ζ", "z"],
	["η", "i"],
	["θ", "th"],
	["ι", "i"],
	["κ", "k"],
	["λ", "l"],
	["μ", "m"],
	["ν", "n"],
	["ξ", "x"],
	["ο", "o"],
	["π", "p"],
	["ρ", "r"],
	["σ", "s"],
	["ς", "s"],
	["τ", "t"],
	["υ", "y"],
	["φ", "f"],
	["χ", "ch"],
	["ψ", "ps"],
	["ω", "o"],
]);

const SEPARATOR = " ";

function fromTables(character: string): string | undefined {
	return latin.get(character) ?? cyrillic.get(character) ?? greek.get(character);
}

/**
 * ASCII form of one lower-case character: letters and digits as ASCII, anything else
 * that is not a letter or digit as a separator, and `undefined` for a letter or digit
 * that has no ASCII form.
 */
function transliterate(character: string): string | undefined {
	const direct = fromTables(character);

	if (direct !== undefined) {
		return direct;
	}

	let ascii = "";

	for (const part of character.normalize("NFKD").replaceAll(/\p{M}/gu, "")) {
		if (/[a-z0-9]/u.test(part)) {
			ascii += part;
			continue;
		}

		const mapped = fromTables(part);

		if (mapped !== undefined) {
			ascii += mapped;
			continue;
		}

		if (/[\p{L}\p{N}]/u.test(part)) {
			return undefined;
		}

		ascii += SEPARATOR;
	}

	return ascii;
}

/**
 * The readable slug of an event name, or an empty string when the
 * name has no complete ASCII form. The slug never selects or authorizes anything.
 */
export function slugify(name: string): string {
	let ascii = "";

	for (const character of name.normalize("NFC").toLowerCase()) {
		const converted = transliterate(character);

		if (converted === undefined) {
			return "";
		}

		ascii += converted;
	}

	const hyphenated = ascii.replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/^-+|-+$/gu, "");

	return hyphenated.slice(0, SLUG_MAX_LENGTH).replace(/-+$/u, "");
}
