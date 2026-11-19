import { type FinalTime, finalDate } from "./final-time";
import { optionDate } from "./poll";
import { eventDates, type Schedule } from "./schedule";

/** The retention period in days, or `never` to keep events permanently. */
export type Retention = number | "never";

/**
 * The planned deletion date, computed from the current retention setting. A dated event is
 * deleted `retention` days after its last date, and a poll after the date of its last option. A weekday event is deleted `retention` days
 * after `lastChange`, taken as a date in the reference zone, unless its final time lies after
 * that date: then it is deleted `retention` days after the final date. With `never` there is no
 * deletion date.
 */
export function deletionDate(
	schedule: Schedule,
	lastChange: Temporal.Instant,
	retention: Retention,
	final: FinalTime,
): Temporal.PlainDate | null {
	if (retention === "never") {
		return null;
	}

	if (schedule.kind === "poll") {
		const last = schedule.options.map((option) => optionDate(option, schedule.referenceZone));
		const latest = last.toSorted((a, b) => Temporal.PlainDate.compare(a, b)).at(-1);

		if (latest === undefined) {
			throw new Error("A poll without options has no deletion date.");
		}

		return latest.add({ days: retention });
	}

	const { days, referenceZone } = schedule;

	if (days.mode !== "weekdays") {
		const last = eventDates(days).at(-1);

		if (last === undefined) {
			throw new Error("A dated event without dates has no deletion date.");
		}

		return last.add({ days: retention });
	}

	const planned = lastChange
		.toZonedDateTimeISO(referenceZone)
		.toPlainDate()
		.add({ days: retention });

	if (final.kind === "open") {
		return planned;
	}

	const date = finalDate(final.start, schedule);

	return Temporal.PlainDate.compare(date, planned) > 0 ? date.add({ days: retention }) : planned;
}

/**
 * The instant the event expires: the end of its deletion date in the reference zone, or
 * `null` when events are kept.
 */
export function expiresAt(
	schedule: Schedule,
	lastChange: Temporal.Instant,
	retention: Retention,
	final: FinalTime,
): Temporal.Instant | null {
	const date = deletionDate(schedule, lastChange, retention, final);

	return date === null
		? null
		: date.add({ days: 1 }).toZonedDateTime({ timeZone: schedule.referenceZone }).toInstant();
}
