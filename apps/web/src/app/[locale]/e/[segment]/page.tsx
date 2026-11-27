import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { ClientMessages } from "@/components/client-messages";
import { EventNotifications } from "@/components/event-notifications";
import { EventBoard } from "@/components/event/event-board";
import { FinalBanner } from "@/components/event/final-time";
import { PollBoard } from "@/components/event/poll-board";
import { LiveUpdates } from "@/components/live-updates";
import { PageMain, PageRegion } from "@/components/page-region";
import { PageShell } from "@/components/page-shell";
import { ShareLink } from "@/components/share-link";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { formatLocale } from "@/i18n/format-locale";
import { getPathname, Link, redirect } from "@/i18n/navigation";
import { type FormatWhen, formatWhen } from "@/lib/final-when";
import { boardOf, byKind, pollBoardOf, serverGridOf, shownFinal } from "@/server/board";
import { readEvent } from "@/server/events";
import { currentHolder } from "@/server/holder";
import { liveSettings } from "@/server/live";
import { eventChoices } from "@/server/notifications";
import { ownerView } from "@/server/ownership";
import { identify } from "@/server/participants";
import { currentVisitor } from "@/server/session";

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
export default async function EventPage({
	params,
	searchParams,
}: PageProps<"/[locale]/e/[segment]">) {
	const { segment } = await params;
	const event = await eventOf(segment);

	if (event === undefined) {
		notFound();
	}

	const locale = await currentLocale();

	const raw = await searchParams;

	if (segment !== event.segment) {
		const query = Object.fromEntries(
			Object.entries(raw).flatMap(([key, value]) => {
				const parsed = z.string().safeParse(value);

				return parsed.success ? [[key, parsed.data] as const] : [];
			}),
		);

		redirect({ href: { pathname: `/e/${event.segment}`, query }, locale });
	}

	const parsedTab = z.enum(["group", "me"]).safeParse(raw["tab"]);
	const initialTab = parsedTab.success ? parsedTab.data : undefined;

	const format = formatLocale(locale, (await headers()).get("accept-language"));
	const t = await getTranslations("Event");
	const { schedule } = event;
	const final = shownFinal(event);
	const kind = byKind(event);
	// The account's participant, or the one the browser's key names, so the page arrives already
	// joined (ADR 0008).
	const holder = await currentHolder(event.id);
	const viewer = holder === undefined ? null : ((await identify(event.id, holder)) ?? null);
	const visitor = await currentVisitor();
	const owner = await ownerView(visitor, event);

	const choices =
		visitor.kind === "signed_in" ? await eventChoices(visitor.accountId, event.id) : [];

	const translateWhen: FormatWhen = (key, values) => t(key, values);

	const board =
		kind.kind === "grid" ? (
			<EventBoard
				event={boardOf(kind.event)}
				viewer={viewer}
				serverGrid={serverGridOf(kind.event, format)}
				formatLocale={format}
				initialTab={initialTab}
			/>
		) : (
			<PollBoard
				event={pollBoardOf(kind.event, format, translateWhen)}
				viewer={viewer}
				formatLocale={format}
			/>
		);

	return (
		<PageShell>
			<ClientMessages namespaces={["Event", "Join", "Copy", "EventNotifications"]}>
				<LiveUpdates eventId={event.id} version={event.version} settings={liveSettings()} />
				<PageMain className="gap-6">
					{final.kind === "chosen" ? (
						<FinalBanner
							event={{
								id: event.id,
								name: event.name,
								description: event.description,
								segment: event.segment,
							}}
							final={final}
							referenceZone={schedule.referenceZone}
							initialWhen={formatWhen(final, schedule.referenceZone, format, translateWhen)}
							formatLocale={format}
						/>
					) : null}
					<header className="flex flex-col gap-3">
						<h1 className="text-3xl break-words sm:text-4xl">{event.name}</h1>
						{event.description === "" ? null : (
							<PageRegion width="measure">
								<p className="text-lg break-words whitespace-pre-line">{event.description}</p>
							</PageRegion>
						)}
						<p className="text-ink-muted">
							{t("referenceZone", { zone: schedule.referenceZone.replaceAll("_", " ") })}
							{" · "}
							{event.deletion.kind === "kept"
								? t(event.deletion.by === "organizer" ? "keptByOrganizer" : "kept")
								: t("deletion", {
										date: event.deletion.date.toLocaleString(format, {
											day: "numeric",
											month: "long",
											year: "numeric",
										}),
									})}
						</p>
						{owner.kind === "owner" ? (
							<Link
								href={`/e/${event.segment}/manage`}
								className="flex min-h-11 w-fit items-center text-action underline underline-offset-4"
							>
								{t("manage")}
							</Link>
						) : null}
						<PageRegion width="form">
							<ShareLink
								label={t("shareLink")}
								path={getPathname({ href: `/e/${event.segment}`, locale })}
							/>
						</PageRegion>
					</header>
					{board}
					<EventNotifications eventId={event.id} choices={choices} />
				</PageMain>
			</ClientMessages>
		</PageShell>
	);
}
