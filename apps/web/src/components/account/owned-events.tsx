"use client";

import { useTranslations } from "next-intl";

import { useFinalWhen } from "@/components/event/final-time";
import { Link } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";

/** An owned event as the server sends it: Temporal values travel as strings. */
export type OwnedEventItem = {
	id: string;
	name: string;
	segment: string;
	/** `YYYY-MM-DD`, or `null` when the event has no deletion date. */
	deletionDate: string | null;
	final: { kind: "open" } | { kind: "chosen"; start: string; end: string };
};

/** The events the account owns, with their deletion date and final time. */
export function OwnedEvents({
	events,
	formatLocale,
}: {
	events: OwnedEventItem[];
	formatLocale: string;
}) {
	const t = useTranslations("Account.events");
	const when = useFinalWhen();
	const zone = useViewerZone();
	const ready = useTemporalReady();

	if (events.length === 0) {
		return <p className="max-w-(--cv-measure)">{t("none")}</p>;
	}

	function details(event: OwnedEventItem): string {
		const deletion =
			event.deletionDate === null
				? t("kept")
				: t("deletion", {
						date: Temporal.PlainDate.from(event.deletionDate).toLocaleString(formatLocale, {
							day: "numeric",
							month: "long",
							year: "numeric",
						}),
					});

		if (event.final.kind === "open") {
			return `${t("open")} · ${deletion}`;
		}

		// The final time is shown in the visitor's zone, which only the browser knows.
		const final = ready && zone !== null ? when(event.final, zone, formatLocale) : "";

		return `${t("final", { when: final })} · ${deletion}`;
	}

	return (
		<ul className="flex flex-col divide-y divide-line border-y border-line">
			{events.map((event) => (
				<li key={event.id} className="flex flex-col gap-1 py-3">
					<span className="flex flex-wrap gap-x-4">
						<Link
							href={`/e/${event.segment}`}
							className="flex min-h-11 items-center font-semibold text-action underline underline-offset-4"
						>
							{event.name}
						</Link>
						<Link
							href={`/e/${event.segment}/manage`}
							className="flex min-h-11 items-center text-action underline underline-offset-4"
						>
							{t("manage")}
						</Link>
					</span>
					<span className="text-sm text-ink-muted">{details(event)}</span>
				</li>
			))}
		</ul>
	);
}
