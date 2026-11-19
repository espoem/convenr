"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { controlClass, Field } from "@/components/field";
import {
	bestWindows,
	mostPeople,
	sameWindow,
	type Window,
	windowTally,
} from "@/domain/best-windows";
import type { GridView } from "@/domain/grid-labels";

import { useCount } from "./count";

type BestWindowsProps = {
	view: GridView;
	/** Every maximal window of the grid. */
	windows: Window[];
	names: string[];
	slotLength: number;
	formatLocale: string;
	selected: Window | null;
	onSelect: (window: Window | null) => void;
};

/** The list of best windows below the grid, with filters by people and length. */
export function BestWindows({
	view,
	windows,
	names,
	slotLength,
	formatLocale,
	selected,
	onSelect,
}: BestWindowsProps) {
	const t = useTranslations("Event");
	const count = useCount();
	const id = useId();
	const [minSlots, setMinSlots] = useState(1);
	// `null` follows the highest count as responses change until the viewer picks a number.
	const [chosenPeople, setChosenPeople] = useState<number | null>(null);
	const highest = mostPeople(windows);
	const minPeople = chosenPeople ?? Math.max(highest, 1);
	const shown = bestWindows(windows, { minSlots, minPeople });
	const longest = Math.max(1, ...windows.map((window) => window.last - window.first + 1));
	const list = new Intl.ListFormat(formatLocale, { type: "conjunction" });

	function duration(slots: number): string {
		const minutes = slots * slotLength;
		const hours = Math.floor(minutes / 60);

		if (hours === 0) {
			return t("durationMinutes", { minutes });
		}

		return minutes % 60 === 0
			? t("durationHours", { hours })
			: t("durationHoursMinutes", { hours, minutes: minutes % 60 });
	}

	function emptyMessage(): string {
		return names.length === 0 ? t("windowsNoParticipants") : t("windowsNone");
	}

	return (
		<section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4">
			<h2 id={`${id}-heading`} className="text-xl">
				{t("windowsHeading")}
			</h2>
			<div className="flex max-w-2xl flex-wrap gap-4">
				<Field id={`${id}-slots`} label={t("minDuration")} className="flex-[1_1_9rem]">
					<select
						id={`${id}-slots`}
						value={minSlots}
						onChange={(event) => setMinSlots(Number(event.target.value))}
						className={controlClass}
					>
						{Array.from({ length: Math.max(longest, minSlots) }, (_, index) => (
							<option key={index} value={index + 1}>
								{duration(index + 1)}
							</option>
						))}
					</select>
				</Field>
				<Field id={`${id}-people`} label={t("minPeople")} className="flex-[1_1_9rem]">
					<select
						id={`${id}-people`}
						value={minPeople}
						onChange={(event) => setChosenPeople(Number(event.target.value))}
						className={controlClass}
					>
						{Array.from({ length: Math.max(names.length, minPeople) }, (_, index) => (
							<option key={index} value={index + 1}>
								{index + 1}
							</option>
						))}
					</select>
				</Field>
			</div>

			{shown.length === 0 ? (
				<p aria-live="polite" className="max-w-(--cv-measure) text-sm text-ink-muted">
					{emptyMessage()}
				</p>
			) : (
				<ol aria-live="polite" className="flex max-w-2xl flex-col gap-2">
					{shown.map((window) => {
						const on = sameWindow(selected, window);

						return (
							<li key={`${window.column}-${window.first}-${window.last}`}>
								<button
									type="button"
									aria-pressed={on}
									onClick={() => onSelect(on ? null : window)}
									className="flex w-full flex-col items-start gap-1 rounded-md border border-earth px-3 py-2 text-left aria-pressed:border-ink aria-pressed:shadow-[inset_0_0_0_1px_var(--cv-ink)]"
								>
									<span className="flex w-full flex-wrap justify-between gap-x-4">
										<span className="font-semibold">
											{view.columns[window.column]?.long},{" "}
											<span className="tabular-nums">
												{view.rows[window.first]?.start}–{view.rows[window.last]?.end}
											</span>
										</span>
										<span className="tabular-nums">{count(windowTally(window), names.length)}</span>
									</span>
									<span className="text-sm break-words">
										{list.format(
											window.people.map(({ person, level }) => {
												const name = names[person] ?? "";

												return level === "if_need_be" ? t("nameIfNeedBe", { name }) : name;
											}),
										)}
									</span>
								</button>
							</li>
						);
					})}
				</ol>
			)}
		</section>
	);
}
