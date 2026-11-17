import { hasLocale } from "next-intl";
import { getLocale } from "next-intl/server";

import { type Locale, routing } from "./routing";

/** The page language as a supported locale; `request.ts` has already refused any other. */
export async function currentLocale(): Promise<Locale> {
  const locale = await getLocale();

  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}
