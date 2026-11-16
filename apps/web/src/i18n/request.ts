import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";

import { routing } from "./routing";

export default getRequestConfig(async () => {
  const requested = await rootParams.locale();
  if (!hasLocale(routing.locales, requested)) {
    notFound();
  }

  const messages = (await import(`../../messages/${requested}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale: requested, messages: messages.default };
});
