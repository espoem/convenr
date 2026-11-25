import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { PageShell } from "@/components/page-shell";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { ProviderButton } from "@/components/provider-button";
import {
	SIGN_IN_EMAIL_ID,
	SIGN_IN_PROBLEMS,
	SignInLinkForm,
	type SignInStatus,
} from "@/components/sign-in-link-form";
import { PROVIDER_NAMES } from "@/domain/provider-address";
import { currentLocale } from "@/i18n/current-locale";
import { redirect } from "@/i18n/navigation";
import { asksToConfirm } from "@/server/confirm-address";
import { offeredProviders } from "@/server/providers";
import { currentVisitor } from "@/server/session";

/**
 * Whether a link was sent, or why not, as the form's redirect names it, and why a provider's
 * sign-in failed, as Better Auth's callback names it.
 */
const statusSchema = z.object({
	sent: z.literal("1").optional(),
	problem: z.enum(SIGN_IN_PROBLEMS).optional(),
	error: z.string().optional(),
});

function statusOf({ sent, problem }: z.infer<typeof statusSchema>): SignInStatus {
	if (problem !== undefined) {
		return { kind: "problem", problem };
	}

	return sent === undefined ? { kind: "none" } : { kind: "sent" };
}

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SignIn");

	return { title: t("title"), robots: { index: false, follow: false } };
}

/** Sign-in by an email link or a provider, which work without scripts, or by a passkey. */
export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
	const visitor = await currentVisitor();
	const locale = await currentLocale();

	if (visitor.kind === "accounts_off") {
		notFound();
	}

	if (visitor.kind === "signed_in") {
		redirect({ href: "/account", locale });
	}

	// An address edited by hand shows no status at all.
	const parsed = statusSchema.safeParse(await searchParams);
	const query = parsed.success ? parsed.data : {};

	// The callback's error and description do not stay in the address. A used email link brings an
	// error as well, beside the problem it stands for.
	if (query.error !== undefined && query.problem === undefined) {
		redirect({
			href: asksToConfirm(query.error)
				? "/sign-in/confirm"
				: { pathname: "/sign-in", query: { problem: "provider_failed" } },
			locale,
		});
	}

	const t = await getTranslations("SignIn");

	return (
		<PageShell>
			<main className="flex max-w-(--cv-form) flex-col gap-6">
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl">{t("heading")}</h1>
					<p className="max-w-(--cv-measure)">{t("intro")}</p>
				</header>
				<SignInLinkForm locale={locale} address="" status={statusOf(query)} />
				<div className="flex flex-col gap-3">
					{offeredProviders().map((provider) => (
						<ProviderButton
							key={provider}
							provider={provider}
							locale={locale}
							label={t("provider", { provider: PROVIDER_NAMES[provider] })}
						/>
					))}
					<PasskeySignIn emailField={SIGN_IN_EMAIL_ID} />
				</div>
			</main>
		</PageShell>
	);
}
