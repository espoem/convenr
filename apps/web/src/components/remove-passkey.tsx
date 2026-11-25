"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { removePasskeyAction } from "@/server/account-actions";

/**
 * Removes a passkey after a question inside the page, as every destructive action asks first.
 * `fields` are the form's hidden inputs: the page's language and the passkey.
 */
export function RemovePasskey({ name, fields }: { name: string; fields: ReactNode }) {
	const t = useTranslations("Account.passkeys");
	const id = useId();
	const [confirming, setConfirming] = useState(false);

	return (
		<div className="flex flex-col gap-3">
			<Button
				type="button"
				variant="destructive"
				aria-expanded={confirming}
				aria-controls={id}
				onClick={() => setConfirming(!confirming)}
				className="w-fit"
			>
				{t("remove")}
			</Button>
			<div id={id} className="empty:hidden">
				{confirming ? (
					<form
						action={removePasskeyAction}
						role="alert"
						className="flex max-w-(--cv-measure) flex-col gap-3"
					>
						{fields}
						<p>{t("removeConfirm", { name })}</p>
						<div className="flex flex-wrap gap-2">
							<Button type="submit" variant="destructive">
								{t("removeYes")}
							</Button>
							<Button type="button" variant="outline" onClick={() => setConfirming(false)}>
								{t("removeNo")}
							</Button>
						</div>
					</form>
				) : null}
			</div>
		</div>
	);
}
