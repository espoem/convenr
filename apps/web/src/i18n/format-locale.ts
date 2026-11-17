import type { Locale } from "./routing";

/**
 * The locale that formats dates and times by spec rule T5: Czech pages use Czech conventions,
 * English pages use the English variant the browser asks for first (`en-GB` writes 24-hour
 * time, `en-US` 12-hour), and plain `en` otherwise.
 */
export function formatLocale(locale: Locale, acceptLanguage: string | null): string {
	if (locale !== "en") {
		return locale;
	}

	const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim() ?? "";

	if (!/^en(-|$)/iu.test(first)) {
		return "en";
	}

	try {
		return Intl.getCanonicalLocales(first)[0] ?? "en";
	} catch {
		return "en";
	}
}
