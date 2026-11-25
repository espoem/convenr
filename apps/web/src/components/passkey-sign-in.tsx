"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/** Whether the browser offers passkeys in the autofill of a field; a newer feature, so detected. */
async function canAutofill(): Promise<boolean> {
	if (
		!("PublicKeyCredential" in globalThis) ||
		!("isConditionalMediationAvailable" in PublicKeyCredential)
	) {
		return false;
	}

	return PublicKeyCredential.isConditionalMediationAvailable();
}

/**
 * The passkey button of the sign-in page. Where the browser supports it, passkeys are also
 * offered in the autofill of the field `emailField`, which then asks for them by its
 * `autocomplete` value.
 */
export function PasskeySignIn({ emailField }: { emailField: string }) {
	const t = useTranslations("SignIn");
	const router = useRouter();
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	useEffect(() => {
		let current = true;

		void canAutofill().then(async (available) => {
			if (!available || !current) {
				return;
			}

			document
				.querySelector(`#${CSS.escape(emailField)}`)
				?.setAttribute("autocomplete", "email webauthn");

			const { error } = await authClient.signIn.passkey({ autoFill: true });

			if (current && error === null) {
				router.push("/account");
			}
		});

		return () => {
			current = false;
		};
	}, [router, emailField]);

	function signIn() {
		startTransition(async () => {
			const { error } = await authClient.signIn.passkey();

			if (error === null) {
				router.push("/account");
			} else {
				setFailed(true);
			}
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				type="button"
				variant="outline"
				disabled={pending}
				onClick={signIn}
				className="w-full sm:w-fit"
			>
				{t("passkey")}
			</Button>
			<p aria-live="polite" className="text-sm font-semibold text-action-active empty:sr-only">
				{failed ? t("passkeyFailed") : ""}
			</p>
		</div>
	);
}
