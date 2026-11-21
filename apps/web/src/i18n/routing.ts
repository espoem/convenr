import { defineRouting } from "next-intl/routing";
import { z } from "zod";

export const routing = defineRouting({
	locales: ["cs", "en"],
	defaultLocale: "en",
	localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/** Reads a language from outside, such as a form field; anything else is the default language. */
export const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
