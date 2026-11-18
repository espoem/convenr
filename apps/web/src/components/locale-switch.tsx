"use client";

import { useLocale, useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** The language switch: it keeps the visitor on the same page. */
export function LocaleSwitch() {
	const t = useTranslations("LocaleSwitch");
	const current = useLocale();
	const pathname = usePathname();

	return (
		<nav aria-label={t("label")}>
			<ul className="flex gap-1">
				{routing.locales.map((locale) => (
					<li key={locale}>
						<Link
							href={pathname}
							locale={locale}
							lang={locale}
							aria-current={locale === current ? "true" : undefined}
							className="inline-flex min-h-11 items-center rounded-md px-3 underline-offset-4 hover:underline aria-[current=true]:font-semibold aria-[current=true]:underline"
						>
							{t(locale)}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
