"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";

import { FLAGS } from "@/components/flags";
import { HeaderMenu, MENU_ENTRY } from "@/components/header-menu";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** The language menu: it keeps the visitor on the same page and at the same scroll position. */
export function LocaleSwitch() {
	const t = useTranslations("LocaleSwitch");
	const active = useLocale();
	const current = routing.locales.find((locale) => locale === active) ?? routing.defaultLocale;
	const pathname = usePathname();

	const CurrentFlag = FLAGS[current];

	return (
		<HeaderMenu
			label={t("button", { language: t(current) })}
			// The code, not the name, so both languages give the button the same width.
			button={
				<>
					<CurrentFlag />
					<span className="w-6 text-center font-semibold">{current.toUpperCase()}</span>
				</>
			}
		>
			<nav aria-label={t("label")} className="contents">
				{routing.locales.map((locale) => {
					const Flag = FLAGS[locale];

					return (
						<Link
							key={locale}
							href={pathname}
							locale={locale}
							lang={locale}
							scroll={false}
							aria-current={locale === current ? "true" : undefined}
							className={MENU_ENTRY}
						>
							<Flag />
							<span className="flex-1">{t(locale)}</span>
							{locale === current ? <CheckIcon aria-hidden className="size-4" /> : null}
						</Link>
					);
				})}
			</nav>
		</HeaderMenu>
	);
}
