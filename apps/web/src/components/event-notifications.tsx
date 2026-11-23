"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { controlClass } from "@/components/field";
import type { EventChoice, NotificationKind } from "@/domain/notifications";
import { useRouter } from "@/i18n/navigation";
import { setEventChoiceAction } from "@/server/notification-actions";

export type EventChoiceItem = { kind: NotificationKind; choice: EventChoice; general: boolean };

/**
 * The signed-in account's emails about this event: each kind that is for it here follows the
 * account page, or is on or off for this event alone.
 */
export function EventNotifications({
	eventId,
	choices,
}: {
	eventId: string;
	choices: EventChoiceItem[];
}) {
	const t = useTranslations("EventNotifications");
	const router = useRouter();
	const [failed, setFailed] = useState(false);
	const [pending, startTransition] = useTransition();

	if (choices.length === 0) {
		return null;
	}

	function choose(kind: NotificationKind, choice: string) {
		startTransition(async () => {
			setFailed(!(await setEventChoiceAction(eventId, kind, choice)));
			router.refresh();
		});
	}

	return (
		<section aria-labelledby="event-notifications" className="flex flex-col gap-3">
			<h2 id="event-notifications" className="text-xl">
				{t("heading")}
			</h2>
			{choices.map(({ kind, choice, general }) => (
				<label key={kind} className="flex max-w-(--cv-form) flex-col gap-1">
					{t(`kind.${kind}`)}
					<select
						value={choice}
						disabled={pending}
						onChange={(change) => choose(kind, change.target.value)}
						className={controlClass}
					>
						<option value="account">{t(general ? "account.on" : "account.off")}</option>
						<option value="on">{t("on")}</option>
						<option value="off">{t("off")}</option>
					</select>
				</label>
			))}
			<p aria-live="polite" className="text-sm font-semibold text-action-active">
				{failed ? t("failed") : ""}
			</p>
		</section>
	);
}
