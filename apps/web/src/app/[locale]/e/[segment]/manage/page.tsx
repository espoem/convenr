import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { EventNotifications } from "@/components/event-notifications";
import { KeepEvent } from "@/components/keep-event";
import { LiveUpdates } from "@/components/live-updates";
import { ManageEvent, type ManagedBoard } from "@/components/manage-event";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { eventFormOptions } from "@/i18n/event-form-options";
import { formatLocale } from "@/i18n/format-locale";
import { Link, redirect } from "@/i18n/navigation";
import { boardOf, byKind, pollBoardOf, serverGridOf } from "@/server/board";
import { readEvent } from "@/server/events";
import { liveSettings } from "@/server/live";
import { eventChoices } from "@/server/notifications";
import { ownerView } from "@/server/ownership";
import { currentVisitor } from "@/server/session";

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

	if (event === undefined) {
		notFound();
	}

	const locale = await currentLocale();

	if (segment !== event.segment) {
		redirect({ href: `/e/${event.segment}/manage`, locale });
	}

	const t = await getTranslations("Manage");
	const format = formatLocale(locale, (await headers()).get("accept-language"));
	const kind = byKind(event);
	const visitor = await currentVisitor();
	const owner = await ownerView(visitor, event);

	const choices =
		visitor.kind === "signed_in" ? await eventChoices(visitor.accountId, event.id) : [];

	const board: ManagedBoard =
		kind.kind === "grid"
			? {
					kind: "grid",
					board: boardOf(kind.event),
					serverGrid: serverGridOf(kind.event, format),
				}
			: { kind: "poll", board: pollBoardOf(kind.event) };

	return (
		<PageShell>
			<LiveUpdates eventId={event.id} version={event.version} settings={liveSettings()} />
			<main className="flex flex-col gap-8">
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl text-balance break-words sm:text-4xl">
						{t.rich("heading", { name: event.name, label })}
					</h1>
					<Link
						href={`/e/${event.segment}`}
						className="inline-flex min-h-11 w-fit items-center text-action underline underline-offset-4"
					>
						{t("open")}
					</Link>
				</div>
				<ManageEvent
					id={event.id}
					options={await eventFormOptions()}
					board={board}
					version={event.version}
					formatLocale={format}
					settings={
						<>
							{owner.kind === "owner" && owner.keeping.kind === "shown" ? (
								<KeepEvent eventId={event.id} kept={owner.keeping.kept} />
							) : null}
							<EventNotifications eventId={event.id} choices={choices} />
						</>
					}
				/>
			</main>
		</PageShell>
	);
}
