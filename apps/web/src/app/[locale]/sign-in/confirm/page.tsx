import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { SignInLinkForm } from "@/components/sign-in-link-form";
import { PROVIDER_NAMES } from "@/domain/provider-address";
import { currentLocale } from "@/i18n/current-locale";
import { redirect } from "@/i18n/navigation";
import { pendingSignIn } from "@/server/pending-sign-in";
import { currentVisitor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SignIn.confirm");

	return { title: t("heading"), robots: { index: false, follow: false } };
}

/**
 * Finishes a provider's sign-in by an email link. It reads the same whether the address is not
 * proved, is missing or already has an account, so it tells nobody which addresses have one.
 */
export default async function ConfirmAddressPage() {
	const visitor = await currentVisitor();
	const locale = await currentLocale();

	if (visitor.kind === "accounts_off") {
		notFound();
	}

	if (visitor.kind === "signed_in") {
		redirect({ href: "/account", locale });
	}

	const t = await getTranslations("SignIn.confirm");
	const pending = await pendingSignIn();

	return (
		<PageShell>
			<main className="flex max-w-(--cv-form) flex-col gap-6">
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl">{t("heading")}</h1>
					<p className="max-w-(--cv-measure)">{t("intro")}</p>
					<p className="max-w-(--cv-measure)">
						{pending === undefined
							? t("afterwards")
							: t("attaches", { provider: PROVIDER_NAMES[pending.provider] })}
					</p>
				</header>
				<SignInLinkForm
					locale={locale}
					address={pending?.address ?? ""}
					status={{ kind: "none" }}
					finishesProvider={pending !== undefined}
				/>
			</main>
		</PageShell>
	);
}
