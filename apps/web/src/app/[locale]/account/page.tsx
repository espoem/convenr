import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { type AccountEventItem, AccountEvents } from "@/components/account/account-events";
import { ClaimEvents } from "@/components/account/claim-events";
import { AddPasskey } from "@/components/add-passkey";
import { controlClass, Field } from "@/components/field";
import { PageShell } from "@/components/page-shell";
import { RemovePasskey } from "@/components/remove-passkey";
import { strong } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_KINDS } from "@/domain/notifications";
import { env } from "@/env";
import { currentLocale } from "@/i18n/current-locale";
import { formatLocale } from "@/i18n/format-locale";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
	changeEmailAction,
	deleteAccountAction,
	endOtherSessionsAction,
	endSessionAction,
	renamePasskeyAction,
	setLanguageAction,
	setNotificationsAction,
	signOutAction,
} from "@/server/account-actions";
import { accountLocaleOrSet, auth } from "@/server/auth";
import { accountChoices } from "@/server/notifications";
import { type AccountEvent, joinedEvents, ownedEvents } from "@/server/ownership";
import { currentVisitor, instantOf } from "@/server/session";

/** What the last action on the page did, or why it failed, as its redirect names it. */
const statusSchema = z.object({
	done: z
		.enum([
			"language",
			"notifications",
			"email_sent",
			"email",
			"session",
			"sessions",
			"passkey",
			"passkey_removed",
		])
		.optional(),
	problem: z
		.enum([
			"invalid_email",
			"too_many_emails",
			"email_not_sent",
			"confirmation_link_invalid",
			"sign_in_again",
			"failed",
		])
		.optional(),
});

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Account");

	return { title: t("title"), robots: { index: false, follow: false } };
}

function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode }) {
	return (
		<section aria-labelledby={id} className="flex flex-col gap-3">
			<h2 id={id} className="text-xl">
				{heading}
			</h2>
			{children}
		</section>
	);
}

/** An event of the account's lists as the client list takes it: Temporal values do not serialize. */
function listItem(event: AccountEvent): AccountEventItem {
	return {
		id: event.id,
		name: event.name,
		segment: event.segment,
		deletion:
			event.deletion.kind === "kept"
				? event.deletion
				: { kind: "on", date: event.deletion.date.toString() },
		final:
			event.final.kind === "open"
				? { kind: "open" }
				: { kind: "chosen", start: event.final.start.toString(), end: event.final.end.toString() },
		role: event.role,
	};
}

/** The account: its events, address, language, passkeys, signed-in browsers and deletion. */
export default async function AccountPage({ searchParams }: PageProps<"/[locale]/account">) {
	const visitor = await currentVisitor();
	const locale = await currentLocale();
	const instance = auth();

	if (visitor.kind === "accounts_off" || instance === undefined) {
		notFound();
	}

	if (visitor.kind === "anonymous") {
		return redirect({ href: "/sign-in", locale });
	}

	const requestHeaders = await headers();
	const format = formatLocale(locale, requestHeaders.get("accept-language"));
	const t = await getTranslations("Account");
	const tLocale = await getTranslations("LocaleSwitch");
	// An address edited by hand shows no status at all.
	const parsed = statusSchema.safeParse(await searchParams);
	const { done, problem } = parsed.success ? parsed.data : {};
	let status = "";

	if (problem !== undefined) {
		status = t(`problem.${problem}`);
	} else if (done !== undefined) {
		status = t(`done.${done}`);
	}

	const [emailLocale, sessions, passkeys, owned, joined, notifications] = await Promise.all([
		accountLocaleOrSet(visitor.accountId, locale),
		instance.api.listSessions({ headers: requestHeaders }),
		instance.api.listPasskeys({ headers: requestHeaders }),
		ownedEvents(visitor.accountId),
		joinedEvents(visitor.accountId),
		accountChoices(visitor.accountId),
	]);

	const { NOTIFY_DIGEST_MINUTES: minutes, REMINDER_HOURS: hours } = env();

	const day = (date: Date) =>
		instantOf(date).toLocaleString(format, {
			day: "numeric",
			month: "long",
			year: "numeric",
		});

	const hidden = <input type="hidden" name="locale" value={locale} />;

	return (
		<PageShell>
			<main className="flex max-w-(--cv-form) flex-col gap-8">
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl">{t("heading")}</h1>
					<p>{t.rich("signedInAs", { email: visitor.email, strong })}</p>
					<form action={signOutAction}>
						{hidden}
						<Button type="submit" variant="outline">
							{t("signOut")}
						</Button>
					</form>
					<output
						className={problem === undefined ? "block" : "block font-semibold text-action-active"}
					>
						{status}
					</output>
				</header>

				<Section id="account-organize" heading={t("events.organized")}>
					<AccountEvents
						events={owned.map((event) => listItem(event))}
						empty={t("events.noneOrganized")}
						formatLocale={format}
					/>
				</Section>

				<Section id="account-joined" heading={t("events.joined")}>
					<AccountEvents
						events={joined.map((event) => listItem(event))}
						empty={t("events.noneJoined")}
						formatLocale={format}
					/>
				</Section>

				<ClaimEvents
					ownedIds={owned.map((event) => event.id)}
					joinedIds={joined.map((event) => event.id)}
				/>

				<Section id="account-address" heading={t("address.heading")}>
					<form action={changeEmailAction} className="flex flex-col gap-3">
						{hidden}
						<Field id="account-email" label={t("address.new")} hint={t("address.hint")}>
							<input
								id="account-email"
								name="email"
								type="email"
								required
								autoComplete="email"
								aria-describedby="account-email-message"
								className={controlClass}
							/>
						</Field>
						<Button type="submit" variant="outline" className="w-full sm:w-fit">
							{t("address.change")}
						</Button>
					</form>
				</Section>

				<Section id="account-language" heading={t("language.heading")}>
					<form action={setLanguageAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
						{hidden}
						<Field id="account-language-select" label={t("language.label")} className="sm:flex-1">
							<select
								id="account-language-select"
								name="language"
								defaultValue={emailLocale}
								className={controlClass}
							>
								{routing.locales.map((option) => (
									<option key={option} value={option}>
										{tLocale(option)}
									</option>
								))}
							</select>
						</Field>
						<Button type="submit" variant="outline" className="w-full sm:w-auto">
							{t("language.save")}
						</Button>
					</form>
				</Section>

				<Section id="account-notifications" heading={t("notifications.heading")}>
					<form action={setNotificationsAction} className="flex flex-col gap-3">
						{hidden}
						<p className="max-w-(--cv-measure)">{t("notifications.intro")}</p>
						{NOTIFICATION_KINDS.map((kind) => (
							<label key={kind} className="flex min-h-11 items-center gap-2">
								<input
									type="checkbox"
									name={kind}
									defaultChecked={notifications[kind]}
									className="size-5 shrink-0"
								/>
								{t(`notifications.${kind}`, { minutes, hours })}
							</label>
						))}
						<Button type="submit" variant="outline" className="w-full sm:w-fit">
							{t("notifications.save")}
						</Button>
					</form>
				</Section>

				<Section id="account-passkeys" heading={t("passkeys.heading")}>
					{passkeys.length === 0 ? <p>{t("passkeys.none")}</p> : null}
					<ul className="flex flex-col gap-4">
						{passkeys.map((key) => (
							<li key={key.id} className="flex flex-col gap-2">
								<form
									action={renamePasskeyAction}
									className="flex flex-col gap-3 sm:flex-row sm:items-end"
								>
									{hidden}
									<input type="hidden" name="passkey" value={key.id} />
									<Field id={`passkey-${key.id}`} label={t("passkeys.name")} className="sm:flex-1">
										<input
											id={`passkey-${key.id}`}
											name="name"
											defaultValue={key.name ?? t("passkeys.unnamed")}
											maxLength={60}
											aria-describedby={
												key.createdAt === undefined
													? `passkey-${key.id}-message`
													: `passkey-${key.id}-created passkey-${key.id}-message`
											}
											className={controlClass}
										/>
									</Field>
									<Button type="submit" variant="outline" className="w-full sm:w-auto">
										{t("passkeys.rename")}
									</Button>
								</form>
								{key.createdAt === undefined ? null : (
									<p id={`passkey-${key.id}-created`} className="text-sm text-ink-muted">
										{t("passkeys.created", { date: day(key.createdAt) })}
									</p>
								)}
								<RemovePasskey
									name={key.name ?? t("passkeys.unnamed")}
									fields={
										<>
											{hidden}
											<input type="hidden" name="passkey" value={key.id} />
										</>
									}
								/>
							</li>
						))}
					</ul>
					<AddPasskey />
				</Section>

				<Section id="account-sessions" heading={t("sessions.heading")}>
					<ul className="flex flex-col gap-3">
						{sessions.map((session) => (
							<li key={session.id} className="flex flex-wrap items-center justify-between gap-3">
								<span>
									<strong>{session.userAgent ?? t("sessions.unknown")}</strong>
									{" · "}
									{t("sessions.started", { date: day(session.createdAt) })}
								</span>
								{session.id === visitor.sessionId ? (
									<span className="text-ink-muted">{t("sessions.current")}</span>
								) : (
									<form action={endSessionAction}>
										{hidden}
										<input type="hidden" name="session" value={session.id} />
										<Button type="submit" variant="outline">
											{t("sessions.end")}
										</Button>
									</form>
								)}
							</li>
						))}
					</ul>
					{sessions.length > 1 ? (
						<form action={endOtherSessionsAction}>
							{hidden}
							<Button type="submit" variant="outline" className="w-full sm:w-fit">
								{t("sessions.endOthers")}
							</Button>
						</form>
					) : null}
				</Section>

				<Section id="account-delete" heading={t("delete.heading")}>
					<p className="max-w-(--cv-measure)">{t("delete.warning")}</p>
					<form action={deleteAccountAction} className="flex flex-col gap-3">
						{hidden}
						<label className="flex min-h-11 items-center gap-2">
							<input type="checkbox" name="confirm" required className="size-5 shrink-0" />
							{t("delete.confirm")}
						</label>
						<Button type="submit" variant="destructive" className="w-full sm:w-fit">
							{t("delete.submit")}
						</Button>
					</form>
				</Section>
			</main>
		</PageShell>
	);
}
