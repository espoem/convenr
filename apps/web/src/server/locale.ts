import { z } from "zod";

import { routing } from "@/i18n/routing";

/** Reads a language from outside, such as a form field; anything else is the default language. */
export const localeSchema = z.enum(routing.locales).catch(routing.defaultLocale);
