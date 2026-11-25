"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

/** Registers a passkey for the signed-in account; the browser asks the person to confirm. */
export function AddPasskey() {
	const t = useTranslations("Account.passkeys");
	const router = useRouter();
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	function add() {
		startTransition(async () => {
			const result = await authClient.passkey.addPasskey();

			setFailed(result?.error !== null && result?.error !== undefined);
			router.refresh();
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<Button type="button" variant="outline" disabled={pending} onClick={add} className="w-fit">
				{t("add")}
			</Button>
			<p aria-live="polite" className="text-sm font-semibold text-action-active empty:sr-only">
				{failed ? t("addFailed") : ""}
			</p>
		</div>
	);
}
