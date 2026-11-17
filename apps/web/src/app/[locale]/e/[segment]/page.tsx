import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";

import { type BoardEvent, EventBoard } from "@/components/event/event-board";
import { PageShell } from "@/components/page-shell";
import { ShareLink } from "@/components/share-link";
import { eventIdFromSegment } from "@/domain/event-address";
import { gridView } from "@/domain/grid-labels";
import { weekdayLayout } from "@/domain/grid-layout";
import { currentLocale } from "@/i18n/current-locale";
import { formatLocale } from "@/i18n/format-locale";
import { getPathname } from "@/i18n/navigation";
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

/** The event page of spec section 11; unknown ids show the not-found page (E9). */
export default async function EventPage({ params }: PageProps<"/[locale]/e/[segment]">) {
	const event = await eventOf((await params).segment);

	if (event === undefined) {
		notFound();
	}

	const locale = await currentLocale();
	const format = formatLocale(locale, (await headers()).get("accept-language"));
	const t = await getTranslations("Event");
	const { schedule } = event;
	const dated = schedule.days.mode !== "weekdays";

	const board: BoardEvent = {
		id: event.id,
		name: event.name,
		segment: event.segment,
		dated,
		referenceZone: schedule.referenceZone,
		firstDayOfWeek: event.firstDayOfWeek,
		slotLength: schedule.slotLength,
		rowCount: (schedule.dailyEnd - schedule.dailyStart) / schedule.slotLength,
		slots: event.slots,
		participants: event.participants,
	};

	return (
		<PageShell>
			<main className="flex flex-col gap-6">
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl break-words sm:text-4xl">{event.name}</h1>
					{event.description === "" ? null : (
						<p className="max-w-[65ch] text-lg break-words whitespace-pre-line">
							{event.description}
						</p>
					)}
					<p className="text-ink-muted">
						{t("referenceZone", { zone: schedule.referenceZone.replaceAll("_", " ") })}
						{" · "}
						{t("deletion", {
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
					weekdayView={
						dated
							? null
							: gridView(
									weekdayLayout(event.slots, event.firstDayOfWeek),
									schedule.slotLength,
									format,
								)
					}
					formatLocale={format}
				/>
			</main>
		</PageShell>
	);
}
