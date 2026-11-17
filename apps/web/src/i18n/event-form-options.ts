import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

import type { EventFormOptions } from "@/components/event-form";
import { localFirstDayOfWeek, timeLabel, weekdayNames } from "@/domain/calendar-labels";

import { currentLocale } from "./current-locale";
import { formatLocale } from "./format-locale";

/** Labels and choices of the event form, formatted on the server for the page (T5). */
export async function eventFormOptions(): Promise<EventFormOptions> {
	const t = await getTranslations("Start");
	const format = formatLocale(await currentLocale(), (await headers()).get("accept-language"));

	return {
		formatLocale: format,
		hours: Array.from({ length: 25 }, (_, hour) =>
			hour === 24 ? t("midnight") : timeLabel(hour * 60, format),
		),
		zones: Intl.supportedValuesOf("timeZone"),
		weekdays: weekdayNames(format),
		firstDayOfWeek: localFirstDayOfWeek(format),
	};
}
