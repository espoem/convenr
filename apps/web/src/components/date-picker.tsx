"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DayName } from "@/domain/calendar-labels";
import { type Weekday, weekdaysFrom } from "@/domain/schedule";

type DatePickerProps = {
	/** ISO dates, in any order. */
	selected: string[];
	onToggle: (date: string) => void;
	firstDayOfWeek: Weekday;
	weekdays: DayName[];
	locale: string;
	describedBy: string;
};

/** A month calendar for choosing single dates, weeks starting on the event's first day of the week. */
export function DatePicker({
	selected,
	onToggle,
	firstDayOfWeek,
	weekdays,
	locale,
	describedBy,
}: DatePickerProps) {
	const t = useTranslations("Create");
	const today = Temporal.Now.plainDateISO();

	// An edited event may already hold past dates; the calendar reaches back
	// to the earliest of them.
	const earliest = [
		today.toPlainYearMonth(),
		...selected.map((iso) => Temporal.PlainYearMonth.from(iso)),
	]
		.toSorted((a, b) => Temporal.PlainYearMonth.compare(a, b))
		.at(0);

	const [month, setMonth] = useState(() => earliest ?? today.toPlainYearMonth());
	const first = month.toPlainDate({ day: 1 });
	const lead = (first.dayOfWeek - firstDayOfWeek + 7) % 7;
	const start = first.subtract({ days: lead });
	const weeks = Math.ceil((lead + month.daysInMonth) / 7);
	const chosen = new Set(selected);
	const order = weekdaysFrom(firstDayOfWeek);

	return (
		<div className="flex w-full max-w-[22rem] flex-col gap-2" aria-describedby={describedBy}>
			<div className="flex items-center justify-between gap-2">
				<Button
					type="button"
					variant="outline"
					aria-label={t("previousMonth")}
					disabled={Temporal.PlainYearMonth.compare(month, earliest ?? month) <= 0}
					onClick={() => setMonth(month.subtract({ months: 1 }))}
				>
					<CaretLeftIcon aria-hidden />
				</Button>
				<p aria-live="polite" className="font-heading text-lg font-semibold">
					{month.toPlainDate({ day: 1 }).toLocaleString(locale, { month: "long", year: "numeric" })}
				</p>
				<Button
					type="button"
					variant="outline"
					aria-label={t("nextMonth")}
					onClick={() => setMonth(month.add({ months: 1 }))}
				>
					<CaretRightIcon aria-hidden />
				</Button>
			</div>
			<div className="grid grid-cols-7 gap-0.5 text-center">
				{order.map((weekday) => (
					<div key={weekday} className="py-1 text-sm font-normal text-ink-muted">
						<abbr title={weekdays[weekday - 1]?.long} className="no-underline">
							{weekdays[weekday - 1]?.short}
						</abbr>
					</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-0.5">
				{Array.from({ length: weeks * 7 }, (_cell, index) => {
					const date = start.add({ days: index });
					const iso = date.toString();

					if (date.month !== month.month) {
						return <span key={iso} aria-hidden />;
					}

					const past = Temporal.PlainDate.compare(date, today) < 0;
					const on = chosen.has(iso);

					return (
						<button
							key={iso}
							type="button"
							aria-pressed={on}
							aria-label={date.toLocaleString(locale, {
								weekday: "long",
								day: "numeric",
								month: "long",
							})}
							disabled={past && !on}
							onClick={() => onToggle(iso)}
							className="min-h-11 w-full rounded-md border border-earth tabular-nums hover:border-ink disabled:border-transparent disabled:text-ink-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
						>
							{date.day}
						</button>
					);
				})}
			</div>
		</div>
	);
}
