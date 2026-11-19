"use client";

import { FlagIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { useTemporalReady, useViewerZone } from "@/lib/browser-time";

import type { ShownFinal } from "./event-board";

type Chosen = Extract<ShownFinal, { kind: "chosen" }>;

const DATE: Intl.DateTimeFormatOptions = {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
};

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/** The final time in `zone`: one date with a time range, or two dated ends across midnight. */
export function useFinalWhen(): (final: Chosen, zone: string, locale: string) => string {
	const t = useTranslations("Event");

	return (final, zone, locale) => {
		const start = Temporal.Instant.from(final.start).toZonedDateTimeISO(zone);
		const end = Temporal.Instant.from(final.end).toZonedDateTimeISO(zone);
		const date = (at: Temporal.ZonedDateTime) => at.toLocaleString(locale, DATE);
		const time = (at: Temporal.ZonedDateTime) => at.toLocaleString(locale, TIME);

		// A window that ends at midnight still ends on its own day.
		const lastDay = end.subtract({ nanoseconds: 1 }).toPlainDate();

		return Temporal.PlainDate.compare(start.toPlainDate(), lastDay) === 0
			? t("finalWhen", { date: date(start), start: time(start), end: time(end) })
			: t("finalWhenAcross", {
					startDate: date(start),
					start: time(start),
					endDate: date(end),
					end: time(end),
				});
	};
}

type FinalBannerProps = { final: Chosen; formatLocale: string };

/** The final time above everything else on the event page, in the viewer's zone. */
export function FinalBanner({ final, formatLocale }: FinalBannerProps) {
	const t = useTranslations("Event");
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const when = useFinalWhen();
	const ready = temporalReady && viewerZone !== null;

	return (
		<section
			aria-label={t("finalTime")}
			className="flex flex-col gap-1 rounded-lg border border-earth p-4"
		>
			<p className="flex items-center gap-2 font-semibold">
				<FlagIcon aria-hidden weight="fill" size={18} />
				{t("finalTime")}
			</p>
			{/* The zone is the browser's, so the text waits for it; the lines keep their height. */}
			<p className="min-h-[1.75em] text-xl text-balance">
				{ready ? when(final, viewerZone, formatLocale) : ""}
			</p>
			<p className="min-h-[1.5em] text-ink-muted">
				{ready ? t("finalZone", { zone: viewerZone.replaceAll("_", " ") }) : ""}
			</p>
		</section>
	);
}

/** The legend entry for the sewn frame in the group grid. */
export function FinalLegend() {
	const t = useTranslations("Event");

	return (
		<div className="flex items-center gap-2 text-sm">
			<span aria-hidden className="relative h-5 w-6 bg-heat-0">
				<span className="cv-final" data-edge="top bottom" />
			</span>
			<span>{t("finalTime")}</span>
		</div>
	);
}
