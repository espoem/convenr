import { eventDates, type Schedule } from "./schedule";

/**
 * The planned deletion date by spec rule E7. A dated event is deleted `retentionDays` after
 * its last date. A weekday event is deleted `retentionDays` after `lastChange`, taken as a
 * date in the reference zone.
 */
export function deletionDate(
  schedule: Schedule,
  lastChange: Temporal.Instant,
  retentionDays: number,
): Temporal.PlainDate {
  const { days, referenceZone } = schedule;

  const base =
    days.mode === "weekdays"
      ? lastChange.toZonedDateTimeISO(referenceZone).toPlainDate()
      : eventDates(days).at(-1);

  if (base === undefined) {
    throw new Error("A dated event without dates has no deletion date.");
  }

  return base.add({ days: retentionDays });
}
