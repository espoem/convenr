import { eventDates, type Schedule } from "./schedule";

/** The retention period in days, or `never` to keep events permanently (Phase 2 rule X1). */
export type Retention = number | "never";

/**
 * The planned deletion date by spec rule E7, computed from the current setting (Phase 2
 * rule X2). A dated event is deleted `retention` days after its last date. A weekday event is
 * deleted `retention` days after `lastChange`, taken as a date in the reference zone. With
 * `never` there is no deletion date.
 */
export function deletionDate(
	schedule: Schedule,
	lastChange: Temporal.Instant,
	retention: Retention,
): Temporal.PlainDate | null {
	if (retention === "never") {
		return null;
	}

	const { days, referenceZone } = schedule;

	const base =
		days.mode === "weekdays"
			? lastChange.toZonedDateTimeISO(referenceZone).toPlainDate()
			: eventDates(days).at(-1);

	if (base === undefined) {
		throw new Error("A dated event without dates has no deletion date.");
	}

	return base.add({ days: retention });
}
