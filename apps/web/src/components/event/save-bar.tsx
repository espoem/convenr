"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { BarMessage } from "./use-participation";

type SaveBarProps = {
	message: BarMessage;
	dirty: boolean;
	saving: boolean;
	/** The edits are answers to a poll's options rather than a grid. */
	poll?: boolean;
	onDiscard: () => void;
	onSave: () => void;
};

/** The bar at the bottom of the screen that saves or discards the participant's edits. */
export function SaveBar({ message, dirty, saving, poll = false, onDiscard, onSave }: SaveBarProps) {
	const t = useTranslations("Event");

	return (
		<div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:-mx-6 sm:px-6">
			<div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
				<p
					aria-live="polite"
					className={cn(
						"mr-auto text-sm",
						message !== null && message !== "saved" && "font-semibold text-action-active",
					)}
				>
					{message === null ? "" : t(poll && message === "changed" ? "pollChanged" : message)}
				</p>
				<Button
					type="button"
					variant="outline"
					disabled={!dirty || saving}
					onClick={onDiscard}
					className="flex-1 sm:flex-none"
				>
					{t("discard")}
				</Button>
				<Button
					type="button"
					disabled={!dirty || saving}
					onClick={onSave}
					className="flex-1 sm:flex-none"
				>
					{saving ? t("saving") : t("save")}
				</Button>
			</div>
		</div>
	);
}
