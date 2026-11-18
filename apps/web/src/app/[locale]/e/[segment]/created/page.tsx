import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { CreatedLinks } from "@/components/created-links";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { eventVersion } from "@/server/events";

export default async function CreatedPage({ params }: PageProps<"/[locale]/e/[segment]/created">) {
	const { segment } = await params;
	const id = eventIdFromSegment(segment);

	// An unknown, deleted or expired event has no links to show (E9, X3).
	if (id === undefined || (await eventVersion(id)) === null) {
		notFound();
	}

	const t = await getTranslations("Created");

	return (
		<PageShell>
			<main className="flex flex-col gap-6">
				<h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
				<CreatedLinks id={id} segment={segment} locale={await currentLocale()} />
			</main>
		</PageShell>
	);
}
