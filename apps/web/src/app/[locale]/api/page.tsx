import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiReference } from "@/components/api-reference/api-reference";
import { PageShell } from "@/components/page-shell";
import { currentLocale } from "@/i18n/current-locale";
import { openApiDocument } from "@/server/api/openapi";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("ApiReference");

	return { title: t("page.metaTitle") };
}

/** The reference of the public API. Every part is rendered here, so it reads without scripts. */
export default async function ApiReferencePage() {
	const document = openApiDocument(await currentLocale());

	return (
		<PageShell>
			<ApiReference document={document} />
		</PageShell>
	);
}
