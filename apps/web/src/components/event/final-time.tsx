"use client";

import { CalendarPlusIcon, FlagIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { type CalendarEntry, googleCalendarUrl, outlookCalendarUrl } from "@/domain/calendar";
import { shareUrl } from "@/domain/event-address";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { cn } from "@/lib/utils";

import type { ShownFinal } from "./event-board";

type Chosen = Extract<ShownFinal, { kind: "chosen" }>;

const DATE: Intl.DateTimeFormatOptions = {
	weekday: "long",
	day: "numeric",
	month: "long",
	year: "numeric",
};

const TIME: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * A final time or a poll option in `zone`: one date with a time range, or two dated ends across
 * midnight.
 */
export function useFinalWhen(): (
	final: Pick<Chosen, "start" | "end">,
	zone: string,
	locale: string,
) => string {
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

type FinalBannerProps = {
	event: { id: string; name: string; description: string; segment: string };
	final: Chosen;
	formatLocale: string;
};

/**
 * The final time above everything else on the event page, in the viewer's zone, with the
 * calendar file and the links that open a new entry at Google Calendar or Outlook.com.
 */
export function FinalBanner({ event, final, formatLocale }: FinalBannerProps) {
	const t = useTranslations("Event");
	const temporalReady = useTemporalReady();
	const viewerZone = useViewerZone();
	const when = useFinalWhen();
	const ready = temporalReady && viewerZone !== null;
	// Through `cn`, as `Button` does, so the outline's border wins over the base's transparent one.
	const linkClass = cn(buttonVariants({ variant: "outline" }));

	// The share link needs the page's own origin, which only the browser knows for sure.
	const entry: CalendarEntry | null = ready
		? {
				id: event.id,
				name: event.name,
				description: event.description,
				shareUrl: shareUrl(window.location.origin, event.segment),
				start: Temporal.Instant.from(final.start),
				end: Temporal.Instant.from(final.end),
				sequence: final.sequence,
			}
		: null;

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
			<div className="flex flex-wrap gap-2 pt-2">
				<a href={`/api/v1/events/${event.id}/final.ics`} download className={linkClass}>
					<CalendarPlusIcon aria-hidden />
					{t("calendarFile")}
				</a>
				{entry === null ? null : (
					<>
						<a
							href={googleCalendarUrl(entry)}
							target="_blank"
							rel="noreferrer"
							className={linkClass}
						>
							{t("calendarGoogle")}
						</a>
						<a
							href={outlookCalendarUrl(entry)}
							target="_blank"
							rel="noreferrer"
							className={linkClass}
						>
							{t("calendarOutlook")}
						</a>
					</>
				)}
			</div>
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
