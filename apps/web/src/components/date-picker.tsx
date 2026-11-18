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

/** A month calendar for choosing single dates (spec rule E2), weeks starting by rule T4. */
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

	// An edited event may already hold past dates (Phase 2 rule M4); the calendar reaches back
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
		<div className="flex w-fit max-w-full flex-col gap-2" aria-describedby={describedBy}>
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
			<table className="border-separate border-spacing-1">
				<thead>
					<tr>
						{order.map((weekday) => (
							<th key={weekday} scope="col" className="text-sm font-normal text-ink-muted">
								<abbr title={weekdays[weekday - 1]?.long} className="no-underline">
									{weekdays[weekday - 1]?.short}
								</abbr>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{Array.from({ length: weeks }, (_week, week) => (
						<tr key={week}>
							{order.map((_weekday, day) => {
								const date = start.add({ days: week * 7 + day });
								const iso = date.toString();

								if (date.month !== month.month) {
									return <td key={iso} aria-hidden />;
								}

								const past = Temporal.PlainDate.compare(date, today) < 0;
								const on = chosen.has(iso);

								return (
									<td key={iso}>
										<button
											type="button"
											aria-pressed={on}
											aria-label={date.toLocaleString(locale, {
												weekday: "long",
												day: "numeric",
												month: "long",
											})}
											disabled={past && !on}
											onClick={() => onToggle(iso)}
											className="size-11 rounded-md border border-line tabular-nums hover:border-earth disabled:border-transparent disabled:text-ink-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:font-semibold aria-pressed:text-surface"
										>
											{date.day}
										</button>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
