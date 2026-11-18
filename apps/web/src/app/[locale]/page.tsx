import { getTranslations } from "next-intl/server";

import { CreateEventForm } from "@/components/create-event-form";
import { MyEvents } from "@/components/my-events";
import { PageShell } from "@/components/page-shell";
import { eventFormOptions } from "@/i18n/event-form-options";

export default async function StartPage() {
	const t = await getTranslations("Start");
	const options = await eventFormOptions();

	return (
		<PageShell>
			<main className="flex flex-col gap-10">
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
