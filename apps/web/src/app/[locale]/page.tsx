import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

import { CreateEventForm, type CreateFormOptions } from "@/components/create-event-form";
import { MyEvents } from "@/components/my-events";
import { PageShell } from "@/components/page-shell";
import { localFirstDayOfWeek, timeLabel, weekdayNames } from "@/domain/calendar-labels";
import { currentLocale } from "@/i18n/current-locale";
import { formatLocale } from "@/i18n/format-locale";

export default async function StartPage() {
  const t = await getTranslations("Start");
  const format = formatLocale(await currentLocale(), (await headers()).get("accept-language"));

  const options: CreateFormOptions = {
    formatLocale: format,
    hours: Array.from({ length: 25 }, (_, hour) =>
      hour === 24 ? t("midnight") : timeLabel(hour * 60, format),
    ),
    zones: Intl.supportedValuesOf("timeZone"),
    weekdays: weekdayNames(format),
    firstDayOfWeek: localFirstDayOfWeek(format),
  };

  return (
    <PageShell>
      <main className="flex flex-col gap-10">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
          <p className="max-w-[65ch] text-lg">{t("lead")}</p>
        </div>
        <MyEvents />
        <section aria-labelledby="create" className="flex flex-col gap-6">
          <h2 id="create" className="text-2xl">
            {t("create")}
          </h2>
          <CreateEventForm options={options} />
        </section>
      </main>
    </PageShell>
  );
}
