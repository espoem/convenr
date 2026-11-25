import { getTranslations } from "next-intl/server";

import { controlClass, Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { requestSignInLinkAction } from "@/server/account-actions";

/** The email field's id, which the passkey autofill attaches to. */
export const SIGN_IN_EMAIL_ID = "sign-in-email";

export const SIGN_IN_PROBLEMS = [
	"invalid_email",
	"too_many_emails",
	"email_not_sent",
	"sign_in_link_invalid",
	"provider_failed",
	"failed",
] as const;

export type SignInStatus =
	| { kind: "none" }
	| { kind: "sent" }
	| { kind: "problem"; problem: (typeof SIGN_IN_PROBLEMS)[number] };

/** Sends a sign-in link to an address; works without scripts. */
export async function SignInLinkForm({
	locale,
	address,
	status,
}: {
	locale: Locale;
	address: string;
	status: SignInStatus;
}) {
	const t = await getTranslations("SignIn");
	const failed = status.kind === "problem";
	let text = "";

	if (status.kind === "problem") {
		text = t(`problem.${status.problem}`);
	} else if (status.kind === "sent") {
		text = t("sent");
	}

	return (
		<form action={requestSignInLinkAction} className="flex flex-col gap-3">
			<input type="hidden" name="locale" value={locale} />
			<Field id={SIGN_IN_EMAIL_ID} label={t("email")}>
				<input
					id={SIGN_IN_EMAIL_ID}
					name="email"
					type="email"
					required
					autoComplete="email"
					defaultValue={address}
					aria-invalid={(failed && status.problem === "invalid_email") || undefined}
					aria-describedby={`${SIGN_IN_EMAIL_ID}-message sign-in-status`}
					className={controlClass}
				/>
			</Field>
			<Button type="submit" className="w-full sm:w-fit">
				{t("send")}
			</Button>
			<output
				id="sign-in-status"
				className={
					failed ? "block font-semibold text-action-active empty:sr-only" : "block empty:sr-only"
				}
			>
				{text}
			</output>
		</form>
	);
}
