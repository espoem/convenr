import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { CreatedLinks } from "@/components/created-links";
import { PageMain } from "@/components/page-region";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { currentLocale } from "@/i18n/current-locale";
import { eventVersion } from "@/server/events";
import { owns } from "@/server/ownership";
import { currentVisitor } from "@/server/session";

export default async function CreatedPage({ params }: PageProps<"/[locale]/e/[segment]/created">) {
	const { segment } = await params;
	const id = eventIdFromSegment(segment);

	// An unknown, deleted or expired event has no links to show.
	if (id === undefined || (await eventVersion(id)) === null) {
		notFound();
	}

	const t = await getTranslations("Created");
	const visitor = await currentVisitor();
	const inAccount = visitor.kind === "signed_in" && (await owns(visitor.accountId, id));

	return (
		<PageShell>
			<PageMain width="form" className="gap-6">
				<h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
				<CreatedLinks
					id={id}
					segment={segment}
					locale={await currentLocale()}
					inAccount={inAccount}
				/>
			</PageMain>
		</PageShell>
	);
}
