import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ManageEvent } from "@/components/manage-event";
import { PageShell } from "@/components/page-shell";
import { eventIdFromSegment } from "@/domain/event-address";
import { eventFormOptions } from "@/i18n/event-form-options";
import { Link } from "@/i18n/navigation";
import { readEvent } from "@/server/events";

/** The manage page (Phase 2 section 8). Its content waits for the admin secret (M1). */
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
			<main className="flex flex-col gap-8">
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl break-words sm:text-4xl">{t("heading", { name: event.name })}</h1>
					<Link
						href={`/e/${event.segment}`}
						className="w-fit text-action underline underline-offset-4"
					>
						{t("open")}
					</Link>
				</div>
				<ManageEvent id={event.id} options={await eventFormOptions()} />
			</main>
		</PageShell>
	);
}
