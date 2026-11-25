"use server";
// Server Actions of the sign-in and account pages. Each posts a plain form, so it works without
// JavaScript, and answers with a redirect whose query says what happened.

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { db } from "@/db/client";
import { accountSettings } from "@/db/schema";
import { redirect } from "@/i18n/navigation";
import { type Locale, localeSchema, routing } from "@/i18n/routing";
import { formText as text } from "@/lib/form-text";

import { type Auth, auth } from "./auth";
import { forgetAddressToConfirm } from "./confirm-address";
import { setAccountChoices } from "./notifications";
import { currentVisitor } from "./session";

const DAY = Temporal.Duration.from({ hours: 24 });

function localeOf(form: FormData): Locale {
	return localeSchema.parse(text(form, "locale"));
}

/** Better Auth, or the start page when accounts are off. */
function instance(locale: Locale): Auth {
	return auth() ?? redirect({ href: "/", locale });
}

/** The problem a refusal of Better Auth names, as the pages show problems; any other is `failed`. */
const refusalSchema = z
	.object({ body: z.object({ code: z.enum(["too_many_emails", "email_not_sent"]) }) })
	.transform((refusal): "too_many_emails" | "email_not_sent" | "failed" => refusal.body.code)
	.catch(() => "failed" as const);

const emailSchema = z.email().max(254);

export async function requestSignInLinkAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const authInstance = instance(locale);
	const email = emailSchema.safeParse(text(form, "email").trim());

	if (!email.success) {
		redirect({ href: { pathname: "/sign-in", query: { problem: "invalid_email" } }, locale });

		return;
	}

	let outcome: { sent: "1" } | { problem: string } = { sent: "1" };

	try {
		await authInstance.api.signInMagicLink({
			body: {
				email: email.data,
				callbackURL: `/${locale}/account`,
				errorCallbackURL: `/${locale}/sign-in?problem=sign_in_link_invalid`,
				metadata: { locale },
			},
			headers: await headers(),
		});
		await forgetAddressToConfirm();
	} catch (error) {
		unstable_rethrow(error);
		outcome = { problem: refusalSchema.parse(error) };
	}

	redirect({ href: { pathname: "/sign-in", query: outcome }, locale });
}

/** The signed-in account, or a redirect to the sign-in page (or start when accounts are off). */
async function signedIn(locale: Locale) {
	const visitor = await currentVisitor();

	if (visitor.kind === "accounts_off") {
		redirect({ href: "/", locale });
	}

	return visitor.kind === "signed_in" ? visitor : redirect({ href: "/sign-in", locale });
}

function backToAccount(locale: Locale, query: Record<string, string>): never {
	return redirect({ href: { pathname: "/account", query }, locale });
}

export async function signOutAction(form: FormData): Promise<void> {
	const locale = localeOf(form);

	await instance(locale).api.signOut({ headers: await headers() });
	redirect({ href: "/", locale });
}

export async function setLanguageAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const chosen = z.enum(routing.locales).safeParse(text(form, "language"));
	const visitor = await signedIn(locale);

	if (chosen.success) {
		await db()
			.insert(accountSettings)
			.values({ accountId: visitor.accountId, locale: chosen.data })
			.onConflictDoUpdate({ target: accountSettings.accountId, set: { locale: chosen.data } });
	}

	backToAccount(locale, { done: "language" });
}

/** Saves which notifications the account gets for all its events; an unchecked kind is off. */
export async function setNotificationsAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const visitor = await signedIn(locale);

	await setAccountChoices(visitor.accountId, {
		responses: text(form, "responses") === "on",
		final: text(form, "final") === "on",
		reminder: text(form, "reminder") === "on",
	});

	backToAccount(locale, { done: "notifications" });
}

export async function changeEmailAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const authInstance = instance(locale);
	const email = emailSchema.safeParse(text(form, "email").trim());

	await signedIn(locale);

	if (!email.success) {
		return backToAccount(locale, { problem: "invalid_email" });
	}

	try {
		await authInstance.api.changeEmail({
			body: { newEmail: email.data, callbackURL: `/${locale}/account?done=email` },
			headers: await headers(),
		});
	} catch (error) {
		unstable_rethrow(error);
		backToAccount(locale, { problem: refusalSchema.parse(error) });
	}

	backToAccount(locale, { done: "email_sent" });
}

export async function endSessionAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const id = text(form, "session");
	const api = instance(locale).api;
	const requestHeaders = await headers();

	await signedIn(locale);

	try {
		// The page names a session by its id; its token never leaves the server.
		const sessions = await api.listSessions({ headers: requestHeaders });
		const session = sessions.find((each) => each.id === id);

		if (session !== undefined) {
			await api.revokeSession({ body: { token: session.token }, headers: requestHeaders });
		}
	} catch (error) {
		unstable_rethrow(error);

		if (error instanceof APIError) {
			backToAccount(locale, { problem: "failed" });
		}

		throw error;
	}

	backToAccount(locale, { done: "session" });
}

export async function endOtherSessionsAction(form: FormData): Promise<void> {
	const locale = localeOf(form);

	await signedIn(locale);
	await instance(locale).api.revokeOtherSessions({ headers: await headers() });
	backToAccount(locale, { done: "sessions" });
}

export async function renamePasskeyAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const authInstance = instance(locale);
	const name = text(form, "name").trim().slice(0, 60);

	await signedIn(locale);

	try {
		await authInstance.api.updatePasskey({
			body: { id: text(form, "passkey"), name },
			headers: await headers(),
		});
	} catch (error) {
		unstable_rethrow(error);

		if (error instanceof APIError) {
			backToAccount(locale, { problem: "failed" });
		}

		throw error;
	}

	backToAccount(locale, { done: "passkey" });
}

export async function removePasskeyAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const authInstance = instance(locale);

	await signedIn(locale);

	try {
		await authInstance.api.deletePasskey({
			body: { id: text(form, "passkey") },
			headers: await headers(),
		});
	} catch (error) {
		unstable_rethrow(error);

		if (error instanceof APIError) {
			backToAccount(locale, { problem: "failed" });
		}

		throw error;
	}

	backToAccount(locale, { done: "passkey_removed" });
}

/**
 * Deletes the account at once when its session is under a day old. An older session first signs
 * in again by an email link, which proves the address still belongs to the visitor.
 */
export async function deleteAccountAction(form: FormData): Promise<void> {
	const locale = localeOf(form);
	const visitor = await signedIn(locale);
	const age = Temporal.Now.instant().since(visitor.sessionCreatedAt);

	if (form.get("confirm") !== "on") {
		backToAccount(locale, {});
	}

	if (Temporal.Duration.compare(age, DAY) >= 0) {
		backToAccount(locale, { problem: "sign_in_again" });
	}

	// Its settings, sessions and passkeys go with it through their foreign keys.
	await instance(locale).api.deleteUser({ body: {}, headers: await headers() });
	redirect({ href: { pathname: "/", query: { deleted: "1" } }, locale });
}
