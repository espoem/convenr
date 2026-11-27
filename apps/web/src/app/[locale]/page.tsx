import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { ClientMessages } from "@/components/client-messages";
import { CreateEventForm } from "@/components/create-event-form";
import { MyEvents } from "@/components/my-events";
import { PageMain, PageRegion } from "@/components/page-region";
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
			<ClientMessages namespaces={["Create", "MyEvents"]}>
				<PageMain className="gap-10">
					{deleted ? (
						<PageRegion width="measure">
							<output className="block font-semibold">{t("accountDeleted")}</output>
						</PageRegion>
					) : null}
					<PageRegion width="measure" className="gap-3">
						<h1 className="text-3xl sm:text-4xl">{t("heading")}</h1>
						<p className="text-lg">{t("lead")}</p>
					</PageRegion>
					<MyEvents />
					<PageRegion as="section" width="form" aria-labelledby="create" className="gap-6">
						<h2 id="create" className="text-2xl">
							{t("create")}
						</h2>
						<CreateEventForm options={options} />
					</PageRegion>
				</PageMain>
			</ClientMessages>
		</PageShell>
	);
}
