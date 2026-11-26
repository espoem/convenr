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

/**
 * Sends a sign-in link to an address; works without scripts. On the confirm page the link also
 * finishes the provider's sign-in that this browser started.
 */
export async function SignInLinkForm({
	locale,
	address,
	status,
	hint,
	finishesProvider = false,
}: {
	locale: Locale;
	address: string;
	status: SignInStatus;
	hint?: string;
	finishesProvider?: boolean;
}) {
	const t = await getTranslations("SignIn");
	const failed = status.kind === "problem";
	const sent = status.kind === "sent";
	let text = "";

	if (status.kind === "problem") {
		text = t(`problem.${status.problem}`);
	} else if (sent) {
		text = t("sent");
	}

	let statusClass = "block empty:sr-only";

	if (failed) {
		statusClass = "block text-sm font-semibold text-action-active empty:sr-only";
	} else if (sent) {
		statusClass =
			"block rounded-md border border-earth bg-surface px-4 py-3 text-sm font-medium text-ink empty:sr-only";
	}

	return (
		<form action={requestSignInLinkAction} className="flex flex-col gap-4">
			<input type="hidden" name="locale" value={locale} />
			{finishesProvider ? <input type="hidden" name="finish" value="provider" /> : null}
			<Field id={SIGN_IN_EMAIL_ID} label={t("email")} hint={hint}>
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
			<output id="sign-in-status" className={statusClass}>
				{text}
			</output>
		</form>
	);
}
