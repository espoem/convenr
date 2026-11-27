import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { connection } from "next/server";

import { routing } from "@/i18n/routing";
import { readTheme } from "@/server/theme";

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
	const messages = await getMessages();
	const theme = await readTheme();

	// Only `LocaleSwitch` reads client translations in the shared shell; pages provide their own
	// client namespaces so static pages do not ship the entire translation catalog.
	const shellMessages = Object.fromEntries(
		Object.entries(messages).filter(([key]) => key === "LocaleSwitch"),
	);

	return (
		// Without a choice the device setting decides through CSS alone.
		<html lang={locale} data-theme={theme === "system" ? undefined : theme}>
			<body>
				<NextIntlClientProvider messages={shellMessages}>{children}</NextIntlClientProvider>
			</body>
		</html>
	);
}
