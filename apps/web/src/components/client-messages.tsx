import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

/** Provides only the named top-level message namespaces to client components below it. */
export async function ClientMessages({
	namespaces,
	children,
}: {
	namespaces: readonly string[];
	children: ReactNode;
}) {
	const messages = await getMessages();

	const picked = Object.fromEntries(
		namespaces.flatMap((key) =>
			Object.hasOwn(messages, key) ? [[key, messages[key]] as const] : [],
		),
	);

	return <NextIntlClientProvider messages={picked}>{children}</NextIntlClientProvider>;
}
