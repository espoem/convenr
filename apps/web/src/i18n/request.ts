import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

// One loader per locale in routing.locales; indexing with a narrowed locale fails to compile if one is missing.
const catalogs = {
  cs: () => import("../../messages/cs.json"),
  en: () => import("../../messages/en.json"),
};

export default getRequestConfig(async () => {
  const requested = await rootParams.locale();

  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }

  const catalog = await catalogs[requested]();

  return { locale: requested, messages: catalog.default };
});
