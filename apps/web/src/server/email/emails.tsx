// The emails, in the account's language from the message catalogs, each with a plain-text part
// and an HTML part in the one layout. Emails go out from route handlers and maintenance too,
// where there is no page locale, so the translator is built from the catalog, not the request.
import { createTranslator } from "next-intl";

import { catalog } from "@/i18n/catalogs";
import type { Locale } from "@/i18n/routing";

import type { Email } from "../mail";
import { EmailButton, EmailText, renderEmailHtml } from "./layout";

type Link = { label: string; url: string };

type Content = { intro: string; link?: Link; rest: string[] };

/** An opening paragraph, an optional link below it and further paragraphs, as both parts. */
async function compose(
	locale: Locale,
	to: string,
	subject: string,
	content: Content,
): Promise<Email> {
	const { intro, link, rest } = content;
	const text = [intro, ...(link === undefined ? [] : [`${link.label}: ${link.url}`]), ...rest];

	const html = await renderEmailHtml({
		locale,
		subject,
		preview: intro,
		children: (
			<>
				<EmailText>{intro}</EmailText>
				{link === undefined ? null : <EmailButton href={link.url}>{link.label}</EmailButton>}
				{rest.map((paragraph) => (
					<EmailText key={paragraph}>{paragraph}</EmailText>
				))}
			</>
		),
	});

	return { to, subject, text: text.join("\n\n"), html };
}

/** An email whose link the visitor waits for: sign-in, or confirming a new address. */
async function linkEmail(
	namespace: "Email.signIn" | "Email.changeEmail",
	locale: Locale,
	to: string,
	url: string,
): Promise<Email> {
	const t = createTranslator({ locale, messages: await catalog(locale), namespace });

	return compose(locale, to, t("subject"), {
		intro: t("intro"),
		link: { label: t("link"), url },
		rest: [t("expiry"), t("ignore")],
	});
}

export async function signInEmail(locale: Locale, to: string, url: string): Promise<Email> {
	return linkEmail("Email.signIn", locale, to, url);
}

export async function changeEmailEmail(locale: Locale, to: string, url: string): Promise<Email> {
	return linkEmail("Email.changeEmail", locale, to, url);
}

export async function emailChangeNotice(
	locale: Locale,
	to: string,
	newEmail: string,
): Promise<Email> {
	const t = createTranslator({
		locale,
		messages: await catalog(locale),
		namespace: "Email.changeNotice",
	});

	return compose(locale, to, t("subject"), {
		intro: t("intro", { email: newEmail }),
		rest: [t("notYou")],
	});
}
