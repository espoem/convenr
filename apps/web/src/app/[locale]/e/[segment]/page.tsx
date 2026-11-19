import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { EventBoard } from "@/components/event/event-board";
import { FinalBanner } from "@/components/event/final-time";
import { PageShell } from "@/components/page-shell";
import { ShareLink } from "@/components/share-link";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { formatLocale } from "@/i18n/format-locale";
import { getPathname } from "@/i18n/navigation";
import { boardOf, weekdayViewOf } from "@/server/board";
import { readEvent } from "@/server/events";

// One database read per request, shared by the metadata and the page.
const eventOf = cache(async (segment: string) => {
	const id = eventIdFromSegment(segment);

	return id === undefined ? undefined : readEvent(id);
});

export async function generateMetadata({
	params,
}: PageProps<"/[locale]/e/[segment]">): Promise<Metadata> {
	const event = await eventOf((await params).segment);

	// Event pages are reached by their link only (ADR 0003): search engines stay out.
	return { title: event?.name ?? "convenr", robots: { index: false, follow: false } };
}

/** The event page; unknown ids show the not-found page. */
export default async function EventPage({ params }: PageProps<"/[locale]/e/[segment]">) {
	const event = await eventOf((await params).segment);

	if (event === undefined) {
		notFound();
	}

	const locale = await currentLocale();
	const format = formatLocale(locale, (await headers()).get("accept-language"));
	const t = await getTranslations("Event");
	const { schedule } = event;
	const board = boardOf(event);

	return (
		<PageShell>
			<main className="flex flex-col gap-6">
				{board.final.kind === "chosen" ? (
					<FinalBanner final={board.final} formatLocale={format} />
				) : null}
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl break-words sm:text-4xl">{event.name}</h1>
					{event.description === "" ? null : (
						<p className="max-w-(--cv-measure) text-lg break-words whitespace-pre-line">
							{event.description}
						</p>
					)}
					<p className="text-ink-muted">
						{t("referenceZone", { zone: schedule.referenceZone.replaceAll("_", " ") })}
						{" · "}
						{event.deletionDate === null
							? t("kept")
							: t("deletion", {
									date: event.deletionDate.toLocaleString(format, {
										day: "numeric",
										month: "long",
										year: "numeric",
									}),
								})}
					</p>
					<div className="max-w-2xl">
						<ShareLink
							label={t("shareLink")}
							path={getPathname({ href: `/e/${event.segment}`, locale })}
						/>
					</div>
				</header>
				<EventBoard
					event={board}
					weekdayView={weekdayViewOf(event, format)}
					formatLocale={format}
				/>
			</main>
		</PageShell>
	);
}
