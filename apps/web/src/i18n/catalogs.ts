import type { Locale } from "./routing";

// One loader per locale in routing.locales; indexing with a narrowed locale fails to compile if one is missing.
const catalogs = {
	cs: () => import("../../messages/cs.json"),
	en: () => import("../../messages/en.json"),
};

/** The message catalog of `locale`. */
export async function catalog(locale: Locale) {
	const loaded = await catalogs[locale]();

	return loaded.default;
}
