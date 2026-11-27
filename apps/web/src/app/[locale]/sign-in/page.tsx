import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ClientMessages } from "@/components/client-messages";
import { PageMain, PageRegion } from "@/components/page-region";
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
import { asksToConfirm } from "@/server/pending-sign-in";
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

	// An address edited by hand shows no status at all.
	const parsed = statusSchema.safeParse(await searchParams);
	const query = parsed.success ? parsed.data : {};
	// A used email link brings an error as well, beside the problem it stands for.
	const providerFailed = query.error !== undefined && query.problem === undefined;

	if (visitor.kind === "signed_in") {
		// Adding a provider ends here when its state is lost, as nothing else names the page.
		redirect({
			href: providerFailed
				? { pathname: "/account", query: { problem: "provider_failed" } }
				: "/account",
			locale,
		});
	}

	// The callback's error and description do not stay in the address.
	if (providerFailed) {
		redirect({
			href: asksToConfirm(query.error ?? "")
				? "/sign-in/confirm"
				: { pathname: "/sign-in", query: { problem: "provider_failed" } },
			locale,
		});
	}

	const t = await getTranslations("SignIn");
	const providers = offeredProviders();

	return (
		<PageShell>
			<ClientMessages namespaces={["SignIn"]}>
				<PageMain className="gap-8">
					<PageRegion as="header" width="measure" className="gap-3">
						<h1 className="text-3xl">{t("heading")}</h1>
						<p className="text-ink-muted">{t("intro")}</p>
					</PageRegion>

					<div className="grid w-full grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.2fr)_1px_minmax(0,0.9fr)] md:items-start md:gap-10">
						<section
							aria-labelledby="sign-in-email-heading"
							className="flex min-w-0 flex-col gap-4"
						>
							<h2 id="sign-in-email-heading" className="text-xl">
								{t("emailHeading")}
							</h2>
							<SignInLinkForm
								locale={locale}
								address=""
								status={statusOf(query)}
								hint={t("emailHint")}
							/>
						</section>

						<div aria-hidden className="hidden w-px self-stretch bg-line md:block" />

						<div aria-hidden className="flex items-center gap-3 text-sm text-ink-muted md:hidden">
							<span className="h-px flex-1 bg-line" />
							<span>{t("or")}</span>
							<span className="h-px flex-1 bg-line" />
						</div>

						<section
							aria-labelledby="sign-in-other-heading"
							className="flex min-w-0 flex-col gap-4"
						>
							<div className="flex flex-col gap-1">
								<h2 id="sign-in-other-heading" className="text-xl">
									{t("otherHeading")}
								</h2>
								<p className="text-sm text-ink-muted">
									{providers.length > 0 ? t("otherIntro") : t("otherPasskeyIntro")}
								</p>
							</div>
							<div className="flex flex-col gap-3">
								{providers.map((provider) => (
									<ProviderButton
										key={provider}
										provider={provider}
										purpose="sign_in"
										locale={locale}
										label={t("provider", { provider: PROVIDER_NAMES[provider] })}
										fullWidth
									/>
								))}
								<PasskeySignIn emailField={SIGN_IN_EMAIL_ID} fullWidth />
							</div>
						</section>
					</div>
				</PageMain>
			</ClientMessages>
		</PageShell>
	);
}
