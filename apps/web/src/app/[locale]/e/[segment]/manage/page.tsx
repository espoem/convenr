import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ManageEvent } from "@/components/manage-event";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { eventFormOptions } from "@/i18n/event-form-options";
import { formatLocale } from "@/i18n/format-locale";
import { Link } from "@/i18n/navigation";
import { boardOf, isGridEvent, weekdayViewOf } from "@/server/board";
import { readEvent } from "@/server/events";

/** The small line above the event name in the heading. */
function label(chunks: ReactNode) {
	return (
		<span className="block font-sans text-base font-normal tracking-normal text-ink-muted">
			{chunks}
		</span>
	);
}

/** The manage page. Its content waits for the admin secret. */
export default async function ManagePage({ params }: PageProps<"/[locale]/e/[segment]/manage">) {
	const { segment } = await params;
	const id = eventIdFromSegment(segment);
	const event = id === undefined ? undefined : await readEvent(id);

	// A poll has no page of its own yet, so it is managed through the API only.
	if (event === undefined || !isGridEvent(event)) {
		notFound();
	}

	const t = await getTranslations("Manage");
	const format = formatLocale(await currentLocale(), (await headers()).get("accept-language"));

	return (
		<PageShell>
			<main className="flex flex-col gap-8">
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl text-balance break-words sm:text-4xl">
						{t.rich("heading", { name: event.name, label })}
					</h1>
					<Link
						href={`/e/${event.segment}`}
						className="w-fit text-action underline underline-offset-4"
					>
						{t("open")}
					</Link>
				</div>
				<ManageEvent
					id={event.id}
					options={await eventFormOptions()}
					board={boardOf(event)}
					weekdayView={weekdayViewOf(event, format)}
					formatLocale={format}
				/>
			</main>
		</PageShell>
	);
}
