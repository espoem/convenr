"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useFinalWhen } from "@/components/event/final-time";
import { Link, useRouter } from "@/i18n/navigation";
import { useTemporalReady, useViewerZone } from "@/lib/browser-time";
import { releaseAction, unlinkAction } from "@/server/ownership-actions";

/** An event of the account's lists as the server sends it: Temporal values travel as strings. */
export type AccountEventItem = {
	id: string;
	name: string;
	segment: string;
	/** The deletion date as `YYYY-MM-DD`, or who keeps the event. */
	deletion: { kind: "on"; date: string } | { kind: "kept"; by: "instance" | "organizer" };
	final: { kind: "open" } | { kind: "chosen"; start: string; end: string };
	role: { kind: "organizer" } | { kind: "participant"; name: string };
};

/**
 * One of the account's lists, with each event's deletion date and final time. The organizer's
 * events link to their manage page; each event can be removed from the account, which releases
 * an owned event and unlinks a joined one.
 */
export function AccountEvents({
	events,
	empty,
	formatLocale,
}: {
	events: AccountEventItem[];
	/** What the list says while it is empty. */
	empty: string;
	formatLocale: string;
}) {
	const t = useTranslations("Account.events");
	const when = useFinalWhen();
	const zone = useViewerZone();
	const ready = useTemporalReady();
	const router = useRouter();
	const [failed, setFailed] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();

	if (events.length === 0) {
		return <p className="max-w-(--cv-measure)">{empty}</p>;
	}

	function details(event: AccountEventItem): string {
		const deletion =
			event.deletion.kind === "kept"
				? t(event.deletion.by === "organizer" ? "keptByOrganizer" : "kept")
				: t("deletion", {
						date: Temporal.PlainDate.from(event.deletion.date).toLocaleString(formatLocale, {
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

	function remove(event: AccountEventItem) {
		startTransition(async () => {
			const removed =
				event.role.kind === "organizer"
					? await releaseAction(event.id)
					: await unlinkAction(event.id);

			setFailed(removed ? null : event.id);
			router.refresh();
		});
	}

	return (
		<ul className="flex flex-col divide-y divide-line border-y border-line">
			{events.map((event) => (
				<li key={event.id} className="flex flex-col gap-1 py-3">
					<span className="flex flex-wrap items-center gap-x-4">
						<Link
							href={`/e/${event.segment}`}
							className="flex min-h-11 items-center font-semibold text-action underline underline-offset-4"
						>
							{event.name}
						</Link>
						{event.role.kind === "organizer" ? (
							<Link
								href={`/e/${event.segment}/manage`}
								className="flex min-h-11 items-center text-action underline underline-offset-4"
							>
								{t("manage")}
							</Link>
						) : null}
						<button
							type="button"
							disabled={pending}
							onClick={() => remove(event)}
							className="min-h-11 text-action underline underline-offset-4"
						>
							{t("unlink")}
						</button>
					</span>
					{event.role.kind === "participant" ? (
						<span className="text-sm">{t("as", { name: event.role.name })}</span>
					) : null}
					<span className="text-sm text-ink-muted">{details(event)}</span>
					{failed === event.id ? (
						<span className="text-sm font-semibold text-action-active">{t("unlinkFailed")}</span>
					) : null}
				</li>
			))}
		</ul>
	);
}
