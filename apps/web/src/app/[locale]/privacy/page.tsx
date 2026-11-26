import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageMain } from "@/components/page-region";
import { PageShell } from "@/components/page-shell";
import { env } from "@/env";

const SECTIONS = [
	"who",
	"data",
	"visible",
	"cookies",
	"processors",
	"retention",
	"delete",
	"rights",
] as const;

const link = "text-action underline underline-offset-4";

/** The markup of the sections' text, with the instance's own operator and contact. */
function tagsFor(operator: string, contact: string) {
	return {
		operator,
		contact,
		p: (text: ReactNode) => <p>{text}</p>,
		ul: (text: ReactNode) => <ul className="flex list-disc flex-col gap-2 ps-5">{text}</ul>,
		li: (text: ReactNode) => <li>{text}</li>,
		code: (text: ReactNode) => <code className="font-mono text-sm">{text}</code>,
		mail: (text: ReactNode) => (
			<a href={`mailto:${contact}`} className={link}>
				{text}
			</a>
		),
		uoou: (text: ReactNode) => (
			<a href="https://uoou.gov.cz" className={link}>
				{text}
			</a>
		),
	};
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Privacy");

	return { title: t("title") };
}

/**
 * What the instance keeps about its visitors, and why. Its processors are those of convenr.party,
 * so an instance shows the page only once its operator names themselves.
 */
export default async function PrivacyPage() {
	const { privacy } = env();

	if (privacy.kind === "off") {
		notFound();
	}

	const t = await getTranslations("Privacy");
	const tags = tagsFor(privacy.operator, privacy.contact);

	return (
		<PageShell>
			<PageMain width="measure" className="gap-8 text-pretty [overflow-wrap:anywhere]">
				<div className="flex flex-col gap-3">
					<h1 className="text-3xl text-balance">{t("heading")}</h1>
					<p className="text-ink-muted">{t("updated")}</p>
					<p>{t("intro")}</p>
				</div>
				{SECTIONS.map((section) => (
					<section
						key={section}
						aria-labelledby={`privacy-${section}`}
						className="flex flex-col gap-3"
					>
						<h2 id={`privacy-${section}`} className="text-xl text-balance">
							{t(`sections.${section}.heading`)}
						</h2>
						{t.rich(`sections.${section}.body`, tags)}
					</section>
				))}
			</PageMain>
		</PageShell>
	);
}
