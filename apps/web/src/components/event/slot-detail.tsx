"use client";

import { XIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";

import { useMediaQuery } from "@/lib/use-media-query";

import { useCount } from "./count";

type SlotDetailProps = {
	day: string;
	time: string;
	available: string[];
	ifNeedBe: string[];
	unavailable: string[];
	/** Position beside the cell on wide screens; on narrow screens it is a bottom panel. */
	x: number;
	y: number;
	onClose: () => void;
};

/** The slot's day and time, the count, and who can come, who can if need be and who cannot. */
export function SlotDetail({
	day,
	time,
	available,
	ifNeedBe,
	unavailable,
	x,
	y,
	onClose,
}: SlotDetailProps) {
	const t = useTranslations("Event");
	const count = useCount();
	const wide = useMediaQuery("(min-width: 40rem)");
	const total = available.length + ifNeedBe.length + unavailable.length;

	const lists = [
		["canCome", available],
		["ifNeedBeCome", ifNeedBe],
		["cannotCome", unavailable],
	] as const;

	return (
		<aside
			aria-label={`${day}, ${time}`}
			aria-live="polite"
			style={wide ? { left: x, top: y } : undefined}
			className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-4px_16px_color-mix(in_oklch,var(--cv-ink),transparent_88%)] sm:absolute sm:right-auto sm:bottom-auto sm:w-72 sm:rounded-lg sm:border sm:pb-3 sm:shadow-[0_4px_16px_color-mix(in_oklch,var(--cv-ink),transparent_88%)]"
		>
			<div className="flex items-start justify-between gap-2">
				{/* The day and the time each keep to one line, so a narrow panel breaks between them. */}
				<p className="font-semibold">
					<span className="whitespace-nowrap">{day}</span>{" "}
					<span className="whitespace-nowrap tabular-nums">{time}</span>
				</p>
				<button
					type="button"
					onClick={onClose}
					aria-label={t("closeDetail")}
					className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md sm:hidden"
				>
					<XIcon aria-hidden className="size-5" />
				</button>
			</div>
			<p className="tabular-nums">
				{count({ available: available.length, ifNeedBe: ifNeedBe.length }, total)}
			</p>
			<dl className="flex flex-col gap-1.5 text-sm">
				{lists.map(([label, names]) => (
					<div key={label}>
						<dt className="text-ink-muted">{t(label)}</dt>
						<dd>{names.length > 0 ? names.join(", ") : t("nobody")}</dd>
					</div>
				))}
			</dl>
		</aside>
	);
}
