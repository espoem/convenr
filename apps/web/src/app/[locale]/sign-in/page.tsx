import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { z } from "zod";

import { controlClass, Field } from "@/components/field";
import { PageShell } from "@/components/page-shell";
import { PasskeySignIn } from "@/components/passkey-sign-in";
import { Button } from "@/components/ui/button";
import { currentLocale } from "@/i18n/current-locale";
import { redirect } from "@/i18n/navigation";
import { requestSignInLinkAction } from "@/server/account-actions";
import { currentVisitor } from "@/server/session";

/** Whether a link was sent, or why not, as the form's redirect names it. */
const statusSchema = z.object({
	sent: z.literal("1").optional(),
	problem: z
		.enum(["invalid_email", "too_many_emails", "email_not_sent", "sign_in_link_invalid", "failed"])
		.optional(),
});

const EMAIL_ID = "sign-in-email";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SignIn");

	return { title: t("title"), robots: { index: false, follow: false } };
}

/** Sign-in by an email link, which works without scripts, or by a passkey. */
export default async function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
	const visitor = await currentVisitor();
	const locale = await currentLocale();

	if (visitor.kind === "accounts_off") {
		notFound();
	}

	if (visitor.kind === "signed_in") {
		redirect({ href: "/account", locale });
	}

	const t = await getTranslations("SignIn");
	// An address edited by hand shows no status at all.
	const parsed = statusSchema.safeParse(await searchParams);
	const { sent, problem } = parsed.success ? parsed.data : {};
	let status = "";

	if (problem !== undefined) {
		status = t(`problem.${problem}`);
	} else if (sent !== undefined) {
		status = t("sent");
	}

	return (
		<PageShell>
			<main className="flex max-w-(--cv-form) flex-col gap-6">
				<header className="flex flex-col gap-3">
					<h1 className="text-3xl">{t("heading")}</h1>
					<p className="max-w-(--cv-measure)">{t("intro")}</p>
				</header>
				<form action={requestSignInLinkAction} className="flex flex-col gap-3">
					<input type="hidden" name="locale" value={locale} />
					<Field id={EMAIL_ID} label={t("email")}>
						<input
							id={EMAIL_ID}
							name="email"
							type="email"
							required
							autoComplete="email"
							aria-invalid={problem === "invalid_email" || undefined}
							aria-describedby={`${EMAIL_ID}-message sign-in-status`}
							className={controlClass}
						/>
					</Field>
					<Button type="submit" className="w-full sm:w-fit">
						{t("send")}
					</Button>
					<output
						id="sign-in-status"
						className={
							problem === undefined
								? "block empty:sr-only"
								: "block font-semibold text-action-active empty:sr-only"
						}
					>
						{status}
					</output>
				</form>
				<PasskeySignIn emailField={EMAIL_ID} />
			</main>
		</PageShell>
	);
}
