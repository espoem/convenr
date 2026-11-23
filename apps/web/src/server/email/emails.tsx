// The emails, in the account's language from the message catalogs, each with a plain-text part
// and an HTML part in the one layout. Emails go out from route handlers and maintenance too,
// where there is no page locale, so the translator is built from the catalog, not the request.
import { createTranslator } from "next-intl";

import type { OutboxMessage } from "@/domain/notifications";
import { catalog } from "@/i18n/catalogs";
import type { Locale } from "@/i18n/routing";

import type { Email } from "../mail";
import { EmailButton, EmailFootnote, EmailText, renderEmailHtml } from "./layout";

type Link = { label: string; url: string };

type Content = { intro: string; link?: Link; rest: string[]; footer?: Link & { reason: string } };

/**
 * An opening paragraph, an optional link below it, further paragraphs and an optional footer
 * with a link of its own, as both parts.
 */
async function compose(
	locale: Locale,
	to: string,
	subject: string,
	content: Content,
): Promise<Email> {
	const { intro, link, rest, footer } = content;

	const text = [
		intro,
		...(link === undefined ? [] : [`${link.label}: ${link.url}`]),
		...rest,
		...(footer === undefined ? [] : [`${footer.reason} ${footer.label}: ${footer.url}`]),
	];

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
				{footer === undefined ? null : <EmailFootnote {...footer} />}
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

/** What a notification email needs beyond its message. */
export type NotificationContext = {
	locale: Locale;
	to: string;
	event: { name: string; referenceZone: string; shareUrl: string };
	/** The unsubscribe page, and the address that unsubscribes with one request (RFC 8058). */
	unsubscribe: { page: string; oneClick: string };
	/** The final time as an iCalendar file for an email that names a picked one, or `null`. */
	calendar: { filename: string; content: string } | null;
};

/** The final time in the event's reference zone, with the zone named. */
function finalWhen(locale: Locale, start: string, end: string, zone: string): string {
	const from = Temporal.Instant.from(start).toZonedDateTimeISO(zone);
	const to = Temporal.Instant.from(end).toZonedDateTimeISO(zone);
	const day = from.toLocaleString(locale, { dateStyle: "full", timeStyle: "short" });
	const until = to.toLocaleString(locale, { timeStyle: "short" });

	return `${day}–${until} (${zone.replaceAll("_", " ")})`;
}

type NotificationText = {
	subject: string;
	intro: string;
	rest: string[];
	open: string;
	reason: string;
	unsubscribe: string;
};

/** Every text of a notification in the account's language. */
async function notificationText(
	locale: Locale,
	event: NotificationContext["event"],
	message: OutboxMessage,
): Promise<NotificationText> {
	const { name, referenceZone } = event;

	const t = createTranslator({
		locale,
		messages: await catalog(locale),
		namespace: "Email.notify",
	});

	const common = {
		open: t("open"),
		reason: t(`reason.${message.kind}`),
		unsubscribe: t("unsubscribe"),
	};

	if (message.kind === "responses") {
		const names = new Intl.ListFormat(locale, { type: "conjunction" }).format(message.names);

		return {
			...common,
			subject: t("responses.subject", { name }),
			intro: t("responses.intro", { name, names }),
			rest: [],
		};
	}

	if (message.final.kind === "open") {
		return {
			...common,
			subject: t("cleared.subject", { name }),
			intro: t("cleared.intro", { name }),
			rest: [],
		};
	}

	const when = finalWhen(locale, message.final.start, message.final.end, referenceZone);

	if (message.kind === "reminder") {
		return {
			...common,
			subject: t("reminder.subject", { name }),
			intro: t("reminder.intro", { name, when }),
			rest: [],
		};
	}

	return {
		...common,
		subject: t("final.subject", { name }),
		intro: t("final.intro", { name, when }),
		rest: [t("final.calendar")],
	};
}

/** A notification about an event: new responses, its final time, or a reminder of it. */
export async function notificationEmail(
	context: NotificationContext,
	message: OutboxMessage,
): Promise<Email> {
	const { locale, to, event, unsubscribe, calendar } = context;
	const text = await notificationText(locale, event, message);

	const email = await compose(locale, to, text.subject, {
		intro: text.intro,
		link: { label: text.open, url: event.shareUrl },
		rest: text.rest,
		footer: { reason: text.reason, label: text.unsubscribe, url: unsubscribe.page },
	});

	email.headers = {
		"List-Unsubscribe": `<${unsubscribe.oneClick}>`,
		"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
	};

	if (calendar !== null) {
		email.attachments = [
			{ ...calendar, contentType: "text/calendar; charset=utf-8; method=PUBLISH" },
		];
	}

	return email;
}
