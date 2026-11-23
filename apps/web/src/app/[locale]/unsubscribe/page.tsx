import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_KINDS } from "@/domain/notifications";
import { env } from "@/env";
import { currentLocale } from "@/i18n/current-locale";
import { unsubscribeAction } from "@/server/notification-actions";
import { unsubscribeKind } from "@/server/notifications";

const querySchema = z.object({
	value: z.string().max(512).optional(),
	done: z.enum(NOTIFICATION_KINDS).optional(),
	problem: z.literal("invalid").optional(),
});

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Unsubscribe");

	return { title: t("title"), robots: { index: false, follow: false } };
}

/**
 * The page an email's unsubscribe link opens. It turns the emails off only when the button is
 * pressed, because mail scanners open links in emails by themselves.
 */
export default async function UnsubscribePage({
	searchParams,
}: PageProps<"/[locale]/unsubscribe">) {
	if (env().accounts.kind === "off") {
		notFound();
	}

	const t = await getTranslations("Unsubscribe");
	const locale = await currentLocale();
	const parsed = querySchema.safeParse(await searchParams);
	const query = parsed.success ? parsed.data : { problem: "invalid" as const };
	const kind = query.value === undefined ? undefined : unsubscribeKind(query.value);
	let body;

	if (query.done !== undefined) {
		body = <p className="max-w-(--cv-measure)">{t(`done.${query.done}`)}</p>;
	} else if (kind === undefined || query.value === undefined) {
		body = <p className="max-w-(--cv-measure)">{t("invalid")}</p>;
	} else {
		body = (
			<form action={unsubscribeAction} className="flex flex-col gap-4">
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="value" value={query.value} />
				<p className="max-w-(--cv-measure)">{t(`intro.${kind}`)}</p>
				<Button type="submit" className="w-fit">
					{t("submit")}
				</Button>
			</form>
		);
	}

	return (
		<PageShell>
			<main className="flex max-w-(--cv-form) flex-col gap-6">
				<h1 className="text-3xl">{t("heading")}</h1>
				{body}
			</main>
		</PageShell>
	);
}
