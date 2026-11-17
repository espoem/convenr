"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { useLocalEvents } from "@/lib/local-events";

/** Events this browser holds, newest first, with the role in each (spec rule B3). */
export function MyEvents() {
	const t = useTranslations("MyEvents");
	const events = [...useLocalEvents().values()].toReversed();

	if (events.length === 0) {
		return null;
	}

	return (
		<section aria-labelledby="my-events" className="flex flex-col gap-3">
			<h2 id="my-events" className="text-2xl">
				{t("heading")}
			</h2>
			<ul className="flex flex-col divide-y divide-line border-y border-line">
				{events.map((event) => (
					<li key={event.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
						<Link
							href={`/e/${event.segment}`}
							className="flex min-h-11 items-center font-semibold text-action underline underline-offset-4"
						>
							{event.name}
						</Link>
						<span className="text-sm text-ink-muted">
							{[
								event.adminSecret === undefined ? undefined : t("organizer"),
								event.participant === undefined
									? undefined
									: t("participant", { name: event.participant.name }),
							]
								.filter(Boolean)
								.join(" · ")}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
