"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { PageRegion } from "@/components/page-region";
import { useRouter } from "@/i18n/navigation";
import { setKeepingAction } from "@/server/ownership-actions";

/** The owner's switch that keeps the event without a time limit. */
export function KeepEvent({ eventId, kept }: { eventId: string; kept: boolean }) {
	const t = useTranslations("Manage.keeping");
	const router = useRouter();
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	function toggle() {
		startTransition(async () => {
			setFailed(!(await setKeepingAction(eventId, !kept)));
			router.refresh();
		});
	}

	return (
		<PageRegion as="section" width="form" aria-labelledby="keep" className="gap-3">
			<h2 id="keep" className="text-2xl">
				{t("heading")}
			</h2>
			<p>{t("intro")}</p>
			<button
				type="button"
				aria-pressed={kept}
				disabled={pending}
				onClick={toggle}
				className="flex min-h-11 w-fit items-center rounded-md border border-earth px-4 font-semibold aria-pressed:bg-ink aria-pressed:text-surface"
			>
				{t("switch")}
			</button>
			<p aria-live="polite" className="text-sm">
				{failed ? t("failed") : t(kept ? "on" : "off")}
			</p>
		</PageRegion>
	);
}
