import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { currentLocale } from "@/i18n/current-locale";
import { Link } from "@/i18n/navigation";
import { unsubscribeAction } from "@/server/notification-actions";
import { unsubscribeTarget } from "@/server/notifications";

const querySchema = z.object({
	value: z.string().max(512).optional(),
	done: z.literal("1").optional(),
	problem: z.literal("invalid").optional(),
});

function strong(text: ReactNode) {
	return <strong>{text}</strong>;
}

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

	const target =
		query.value === undefined || query.problem !== undefined
			? ({ status: "invalid" } as const)
			: await unsubscribeTarget(query.value);

	let body;

	if (target.status === "invalid" || query.value === undefined) {
		body = <p className="max-w-(--cv-measure)">{t("invalid")}</p>;
	} else if (target.status === "event_gone") {
		body = <p className="max-w-(--cv-measure)">{t("gone")}</p>;
	} else if (query.done === undefined) {
		body = (
			<form action={unsubscribeAction} className="flex flex-col gap-4">
				<input type="hidden" name="locale" value={locale} />
				<input type="hidden" name="value" value={query.value} />
				<p className="max-w-(--cv-measure)">
					{t.rich(`intro.${target.kind}`, { name: target.name, strong })}
				</p>
				<Button type="submit" className="w-fit">
					{t("submit")}
				</Button>
			</form>
		);
	} else {
		body = (
			<>
				<output className="block max-w-(--cv-measure)">
					{t.rich(`done.${target.kind}`, { name: target.name, strong })}
				</output>
				<Link
					href={`/e/${target.segment}`}
					className="flex min-h-11 w-fit items-center text-action underline underline-offset-4"
				>
					{t("open")}
				</Link>
			</>
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
