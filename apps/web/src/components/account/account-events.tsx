"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useFinalWhen } from "@/components/event/final-time";
import { Button } from "@/components/ui/button";
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
 * events link to their manage page; each event can be removed from the account after a
 * confirmation, which releases an owned event and unlinks a joined one.
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
	const [confirming, setConfirming] = useState<string | null>(null);
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
			setConfirming(null);
			router.refresh();
		});
	}

	// Releasing an owned event can leave the visitor with no way to manage it, so it is said first.
	function consequence(event: AccountEventItem): string {
		if (event.role.kind === "participant") {
			return t("unlinkConfirm", { name: event.name, participant: event.role.name });
		}

		const kept = event.deletion.kind === "kept" && event.deletion.by === "organizer";

		return kept
			? `${t("releaseConfirm", { name: event.name })} ${t("releaseKept")}`
			: t("releaseConfirm", { name: event.name });
	}

	return (
		<ul className="flex flex-col divide-y divide-line border-y border-line">
			{events.map((event) => (
				<li key={event.id} className="flex flex-col gap-2 py-3">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex min-w-0 flex-col">
							<Link
								href={`/e/${event.segment}`}
								className="w-fit font-semibold break-words text-action underline underline-offset-4"
							>
								{event.name}
							</Link>
							{event.role.kind === "participant" ? (
								<span className="text-sm">{t("as", { name: event.role.name })}</span>
							) : null}
							<span className="text-sm text-ink-muted">{details(event)}</span>
						</div>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
							{event.role.kind === "organizer" ? (
								<Link
									href={`/e/${event.segment}/manage`}
									className="flex min-h-11 items-center text-action underline underline-offset-4"
								>
									{t("manage")}
								</Link>
							) : null}
							<Button
								type="button"
								variant="destructive"
								disabled={pending}
								aria-expanded={confirming === event.id}
								aria-controls={`unlink-${event.id}`}
								onClick={() => setConfirming(confirming === event.id ? null : event.id)}
							>
								{t("unlink")}
							</Button>
						</div>
					</div>
					<div id={`unlink-${event.id}`}>
						{confirming === event.id ? (
							<div role="alert" className="flex max-w-(--cv-measure) flex-col gap-3">
								<p>{consequence(event)}</p>
								<div className="flex flex-wrap gap-2">
									<Button
										type="button"
										variant="destructive"
										disabled={pending}
										onClick={() => remove(event)}
									>
										{t("unlinkYes")}
									</Button>
									<Button type="button" variant="outline" onClick={() => setConfirming(null)}>
										{t("unlinkNo")}
									</Button>
								</div>
							</div>
						) : null}
					</div>
					{failed === event.id ? (
						<span className="text-sm font-semibold text-action-active">{t("unlinkFailed")}</span>
					) : null}
				</li>
			))}
		</ul>
	);
}
