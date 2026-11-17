// Localized names of days and times for spec rule T5. These need Temporal, so the server
// computes them for anything it renders and the browser only for the dated grid.
import { MINUTES_PER_DAY, toWeekday, type Weekday, WEEKDAYS } from "./schedule";

declare global {
	namespace Intl {
		interface Locale {
			/** Node.js and current browsers have it; TypeScript's library does not declare it yet. */
			getWeekInfo?(): { firstDay: number };
		}
	}
}

/** 2024-01-01 was a Monday, so day `n` of that week has ISO day of week `n`. */
const REFERENCE_MONDAY = Temporal.PlainDate.from("2024-01-01");

export type DayName = { short: string; long: string };

/** Names of the days of the week, indexed by ISO day of week minus one. */
export function weekdayNames(locale: string): DayName[] {
	return WEEKDAYS.map((weekday: Weekday) => {
		const date = REFERENCE_MONDAY.add({ days: weekday - 1 });

		return {
			short: date.toLocaleString(locale, { weekday: "short" }),
			long: date.toLocaleString(locale, { weekday: "long" }),
		};
	});
}

/** A time of day given in minutes after midnight; 1440 is shown as midnight. */
export function timeLabel(minute: number, locale: string): string {
	const wrapped = minute % MINUTES_PER_DAY;

	return Temporal.PlainTime.from({
		hour: Math.floor(wrapped / 60),
		minute: wrapped % 60,
	}).toLocaleString(locale, { hour: "numeric", minute: "2-digit" });
}

/** The first day of the week where `locale` is used, or Monday when the platform cannot say. */
export function localFirstDayOfWeek(locale: string): Weekday {
	const firstDay = new Intl.Locale(locale).getWeekInfo?.().firstDay;

	return (firstDay === undefined ? undefined : toWeekday(firstDay)) ?? 1;
}
