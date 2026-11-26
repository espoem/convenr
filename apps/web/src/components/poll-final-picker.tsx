"use client";

import { FlagIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { finalKeyOf, type PollBoardEvent } from "@/components/event/poll-board";
import { BestOptions, PollTable, useOptionWhen } from "@/components/event/poll-table";
import { useFinalChange } from "@/components/final-picker";
import { PageRegion, widthClass } from "@/components/page-region";
import { Button } from "@/components/ui/button";
import { useViewerZone } from "@/lib/browser-time";
import type { ManageCredential } from "@/lib/manage-credential";
import { cn } from "@/lib/utils";
import { clearFinalAction, pickFinalAction } from "@/server/event-actions";

type PollFinalPickerProps = {
	event: PollBoardEvent;
	formatLocale: string;
	credential: ManageCredential;
	/** The credential stopped fitting. */
	onDenied: () => void;
};

/** Picking and clearing the final time of a poll on the manage page: one of its options. */
export function PollFinalPicker({
	event,
	formatLocale,
	credential,
	onDenied,
}: PollFinalPickerProps) {
	const t = useTranslations("Manage");
	const tEvent = useTranslations("Event");
	const id = useId();
	const viewerZone = useViewerZone();
	const whenOf = useOptionWhen(viewerZone, formatLocale);
	const { message, pending, send } = useFinalChange(onDenied);
	const finalKey = finalKeyOf(event.final);
	const final = event.options.find((option) => option.key === finalKey);

	return (
		<section aria-labelledby={`${id}-final`} className="flex flex-col gap-4">
			<h2 id={`${id}-final`} className="text-2xl">
				{tEvent("finalTime")}
			</h2>

			{final === undefined ? (
				<PageRegion width="measure">
					<p className="text-ink-muted">{t("finalNone")}</p>
				</PageRegion>
			) : (
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
					<p className={cn("min-h-[1.5em] text-lg", widthClass("measure", { fit: true }))}>
						{t("finalIs", { when: whenOf(final) })}
					</p>
					<Button
						type="button"
						variant="outline"
						disabled={pending}
						onClick={() => send(() => clearFinalAction(event.id, credential))}
					>
						{t("finalClear")}
					</Button>
				</div>
			)}

			<PageRegion width="measure">
				<p className="text-sm text-ink-muted">{t("pollFinalHint")}</p>
			</PageRegion>

			<PollTable
				event={{ ...event, finalKey }}
				zone={viewerZone}
				formatLocale={formatLocale}
				label={t("pollFinalTable")}
				action={{
					heading: tEvent("finalTime"),
					renderCell: (option, when) =>
						option.key === finalKey ? (
							<span className="flex min-h-11 items-center gap-1.5 font-semibold">
								<FlagIcon aria-hidden weight="fill" size={16} />
								{t("pollIsFinal")}
							</span>
						) : (
							<Button
								type="button"
								variant="outline"
								disabled={pending}
								aria-label={t("pollPickLabel", { when })}
								onClick={() =>
									send(() => pickFinalAction(event.id, credential, [option.key], null))
								}
							>
								{t("finalPick")}
							</Button>
						),
				}}
			/>

			<p aria-live="polite" className="text-sm font-semibold text-action-active empty:sr-only">
				{message ?? ""}
			</p>

			<BestOptions
				options={event.options}
				best={event.best}
				names={event.participants.map((person) => person.name)}
				zone={viewerZone}
				formatLocale={formatLocale}
			/>
		</section>
	);
}
