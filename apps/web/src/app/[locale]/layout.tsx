import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { routing } from "@/i18n/routing";

import "../globals.css";

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Meta");

	return { title: t("title"), description: t("description") };
}

// Every page renders per request so that Next.js can put the nonce of the Content Security
// Policy on its scripts (ADR 0003 item 9). A prerendered shell would carry no nonce.
export default async function RootLayout({ children }: LayoutProps<"/[locale]">) {
	await connection();

	const locale = await getLocale();

	return (
		<html lang={locale}>
			<body>
				<NextIntlClientProvider>{children}</NextIntlClientProvider>
			</body>
		</html>
	);
}
