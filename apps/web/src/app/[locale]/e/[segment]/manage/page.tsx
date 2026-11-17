import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AdminCheck } from "@/components/admin-check";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { Link } from "@/i18n/navigation";
import { readEvent } from "@/server/events";

/** In Phase 1 the manage page only confirms the admin link (spec section 11). */
export default async function ManagePage({ params }: PageProps<"/[locale]/e/[segment]/manage">) {
	const { segment } = await params;
	const id = eventIdFromSegment(segment);
	const event = id === undefined ? undefined : await readEvent(id);

	if (event === undefined) {
		notFound();
	}

	const t = await getTranslations("Manage");

	return (
		<PageShell>
			<main className="flex flex-col gap-4">
				<h1 className="text-3xl sm:text-4xl">{t("heading", { name: event.name })}</h1>
				<AdminCheck id={event.id} name={event.name} segment={event.segment} />
				<p className="max-w-[65ch]">{t("comingSoon")}</p>
				<Link
					href={`/e/${event.segment}`}
					className="w-fit text-action underline underline-offset-4"
				>
					{t("open")}
				</Link>
			</main>
		</PageShell>
	);
}
