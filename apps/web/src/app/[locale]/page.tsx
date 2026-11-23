import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { CreateEventForm } from "@/components/create-event-form";
import { MyEvents } from "@/components/my-events";
import { PageShell } from "@/components/page-shell";
import { eventFormOptions } from "@/i18n/event-form-options";

/** Deleting an account ends here, and the page says it happened. */
const querySchema = z.object({ deleted: z.literal("1").optional() });

export default async function StartPage({ searchParams }: PageProps<"/[locale]">) {
	const t = await getTranslations("Start");
	const options = await eventFormOptions();
	const query = querySchema.safeParse(await searchParams);
	const deleted = query.success && query.data.deleted !== undefined;

	return (
		<PageShell>
			<main className="flex flex-col gap-10">
				{deleted ? (
					<output className="block max-w-(--cv-measure) font-semibold">
						{t("accountDeleted")}
					</output>
				) : null}
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
					<p className="max-w-(--cv-measure) text-lg">{t("lead")}</p>
				</div>
				<MyEvents />
				<section aria-labelledby="create" className="flex flex-col gap-6">
					<h2 id="create" className="text-2xl">
						{t("create")}
					</h2>
					<CreateEventForm options={options} />
				</section>
			</main>
		</PageShell>
	);
}
