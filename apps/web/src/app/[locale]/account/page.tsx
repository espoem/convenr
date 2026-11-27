import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { type AccountEventItem, AccountEvents } from "@/components/account/account-events";
import { ClaimEvents } from "@/components/account/claim-events";
import { AddPasskey } from "@/components/add-passkey";
import { ClientMessages } from "@/components/client-messages";
import { controlClass, Field, Select } from "@/components/field";
import { PageMain, PageRegion, type PageWidth } from "@/components/page-region";
import { PageShell } from "@/components/page-shell";
import { ProviderButton } from "@/components/provider-button";
import { RemoveQuestion } from "@/components/remove-question";
import { strong } from "@/components/rich-text";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_KINDS } from "@/domain/notifications";
import { PROVIDER_NAMES } from "@/domain/provider-address";
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
	removePasskeyAction,
	removeProviderAction,
	renamePasskeyAction,
	setLanguageAction,
	setNotificationsAction,
	signOutAction,
} from "@/server/account-actions";
import { accountProviders } from "@/server/account-providers";
import { accountLocaleOrSet, auth } from "@/server/auth";
import { accountChoices } from "@/server/notifications";
import { type AccountEvent, joinedEvents, ownedEvents } from "@/server/ownership";
import { offeredProviders } from "@/server/providers";
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
			"provider",
			"provider_removed",
		])
		.optional(),
	problem: z
		.enum([
			"invalid_email",
			"too_many_emails",
			"email_not_sent",
			"confirmation_link_invalid",
			"sign_in_again",
			"provider_failed",
			"provider_in_other_account",
			"failed",
		])
		.optional(),
	error: z.string().optional(),
});

type Status = z.infer<typeof statusSchema>;

/** What an error of Better Auth means, which it adds to the address it was told to return to. */
function problemOf(error: string, done: Status["done"]): NonNullable<Status["problem"]> {
	// Only a link that confirms an address returns to a page that says what is done.
	if (done === "email") {
		return "confirmation_link_invalid";
	}

	return error === "account_already_linked_to_different_user"
		? "provider_in_other_account"
		: "provider_failed";
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Account");

	return { title: t("title"), robots: { index: false, follow: false } };
}

// The box sits beside the first line of a label that wraps; a one-line row keeps its full height.
const CHECK_ROW = "flex min-h-11 items-start gap-2 py-2.5";
const CHECK_BOX = "mt-0.5 size-5 shrink-0";

function Section({
	id,
	heading,
	width = "form",
	children,
}: {
	id: string;
	heading: string;
	width?: PageWidth;
	children: ReactNode;
}) {
	return (
		<PageRegion as="section" width={width} aria-labelledby={id} className="gap-3">
			<h2 id={id} className="text-xl">
				{heading}
			</h2>
			{children}
		</PageRegion>
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
	const { done, problem, error } = parsed.success ? parsed.data : {};

	// The error and its description do not stay in the address.
	if (error !== undefined) {
		redirect({
			href: { pathname: "/account", query: { problem: problemOf(error, done) } },
			locale,
		});
	}

	let status = "";

	if (problem !== undefined) {
		status = t(`problem.${problem}`);
	} else if (done !== undefined) {
		status = t(`done.${done}`);
	}

	const [emailLocale, sessions, passkeys, providers, owned, joined, notifications] =
		await Promise.all([
			accountLocaleOrSet(visitor.accountId, locale),
			instance.api.listSessions({ headers: requestHeaders }),
			instance.api.listPasskeys({ headers: requestHeaders }),
			accountProviders(visitor.accountId),
			ownedEvents(visitor.accountId),
			joinedEvents(visitor.accountId),
			accountChoices(visitor.accountId),
		]);

	const addable = offeredProviders().filter(
		(offered) => !providers.some(({ provider }) => provider === offered),
	);

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
			<ClientMessages namespaces={["Account", "MyEvents"]}>
				<PageMain className="gap-8">
					<PageRegion as="header" width="form" className="gap-3">
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
					</PageRegion>

					<Section id="account-organize" heading={t("events.organized")} width="column">
						<AccountEvents
							events={owned.map((event) => listItem(event))}
							empty={t("events.noneOrganized")}
							formatLocale={format}
						/>
					</Section>

					<Section id="account-joined" heading={t("events.joined")} width="column">
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
						<form
							action={setLanguageAction}
							className="flex flex-col gap-3 sm:flex-row sm:items-end"
						>
							{hidden}
							<Field id="account-language-select" label={t("language.label")} className="sm:flex-1">
								<Select id="account-language-select" name="language" defaultValue={emailLocale}>
									{routing.locales.map((option) => (
										<option key={option} value={option}>
											{tLocale(option)}
										</option>
									))}
								</Select>
							</Field>
							<Button type="submit" variant="outline" className="w-full sm:w-auto">
								{t("language.save")}
							</Button>
						</form>
					</Section>

					<Section id="account-notifications" heading={t("notifications.heading")}>
						<form action={setNotificationsAction} className="flex flex-col gap-3">
							{hidden}
							<p>{t("notifications.intro")}</p>
							{NOTIFICATION_KINDS.map((kind) => (
								<label key={kind} className={CHECK_ROW}>
									<input
										type="checkbox"
										name={kind}
										defaultChecked={notifications[kind]}
										className={CHECK_BOX}
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
										<Field
											id={`passkey-${key.id}`}
											label={t("passkeys.name")}
											className="sm:flex-1"
										>
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
									<RemoveQuestion
										action={removePasskeyAction}
										fields={
											<>
												{hidden}
												<input type="hidden" name="passkey" value={key.id} />
											</>
										}
										texts={{
											remove: t("passkeys.remove"),
											question: t("passkeys.removeConfirm", {
												name: key.name ?? t("passkeys.unnamed"),
											}),
											yes: t("passkeys.removeYes"),
											no: t("passkeys.removeNo"),
										}}
									/>
								</li>
							))}
						</ul>
						<AddPasskey />
					</Section>

					{providers.length === 0 && addable.length === 0 ? null : (
						<Section id="account-providers" heading={t("providers.heading")}>
							<p>{t("providers.intro")}</p>
							{providers.length === 0 ? null : (
								<ul className="flex flex-col gap-4">
									{providers.map(({ id, provider, addedAt }) => (
										<li key={id} className="flex flex-col gap-2">
											<span>
												<strong>{PROVIDER_NAMES[provider]}</strong>
												{" · "}
												{t("providers.added", { date: day(addedAt) })}
											</span>
											<RemoveQuestion
												action={removeProviderAction}
												fields={
													<>
														{hidden}
														<input type="hidden" name="provider" value={provider} />
													</>
												}
												texts={{
													remove: t("providers.remove", { provider: PROVIDER_NAMES[provider] }),
													question: t("providers.removeConfirm", {
														provider: PROVIDER_NAMES[provider],
													}),
													yes: t("providers.removeYes"),
													no: t("providers.removeNo"),
												}}
											/>
										</li>
									))}
								</ul>
							)}
							{addable.length === 0 ? null : (
								<div className="flex flex-col gap-3 sm:max-w-sm">
									{addable.map((provider) => (
										<ProviderButton
											key={provider}
											provider={provider}
											purpose="add"
											locale={locale}
											label={t("providers.add", { provider: PROVIDER_NAMES[provider] })}
											fullWidth
										/>
									))}
								</div>
							)}
						</Section>
					)}

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
						<p>{t("delete.warning")}</p>
						<form action={deleteAccountAction} className="flex flex-col gap-3">
							{hidden}
							<label className={CHECK_ROW}>
								<input type="checkbox" name="confirm" required className={CHECK_BOX} />
								{t("delete.confirm")}
							</label>
							<Button type="submit" variant="destructive" className="w-full sm:w-fit">
								{t("delete.submit")}
							</Button>
						</form>
					</Section>
				</PageMain>
			</ClientMessages>
		</PageShell>
	);
}
