import { type FinalTime, finalDate } from "./final-time";
import { optionDate } from "./poll";
import { eventDates, type Schedule } from "./schedule";

/** The retention period in days, or `never` to keep events permanently. */
export type Retention = number | "never";

/**
 * Whether the owner keeps the event without a time limit: never kept, kept now, or kept until
 * `at`, when the owner turned the keeping off or the event lost its owner.
 */
export type Keeping =
	| { kind: "not_kept" }
	| { kind: "kept" }
	| { kind: "ended"; at: Temporal.Instant };

/** When the event is deleted, or who keeps it: the instance setting or the event's owner. */
export type Deletion =
	| { kind: "on"; date: Temporal.PlainDate }
	| { kind: "kept"; by: "instance" | "organizer" };

/**
 * The planned deletion date for a retention of `days`. A dated event is deleted `days` after its
 * last date, and a poll after the date of its last option. A weekday event is deleted `days`
 * after `lastChange`, taken as a date in the reference zone, unless its final time lies after
 * that date: then it is deleted `days` after the final date.
 */
function plannedDate(
	schedule: Schedule,
	lastChange: Temporal.Instant,
	days: number,
	final: FinalTime,
): Temporal.PlainDate {
	if (schedule.kind === "poll") {
		const last = schedule.options.map((option) => optionDate(option, schedule.referenceZone));
		const latest = last.toSorted((a, b) => Temporal.PlainDate.compare(a, b)).at(-1);

		if (latest === undefined) {
			throw new Error("A poll without options has no deletion date.");
		}

		return latest.add({ days });
	}

	const { referenceZone } = schedule;

	if (schedule.days.mode !== "weekdays") {
		const last = eventDates(schedule.days).at(-1);

		if (last === undefined) {
			throw new Error("A dated event without dates has no deletion date.");
		}

		return last.add({ days });
	}

	const planned = lastChange.toZonedDateTimeISO(referenceZone).toPlainDate().add({ days });

	if (final.kind === "open") {
		return planned;
	}

	const date = finalDate(final.start, schedule);

	return Temporal.PlainDate.compare(date, planned) > 0 ? date.add({ days }) : planned;
}

/**
 * When the event is deleted under the current retention setting. An event its owner keeps is not
 * deleted. Once the keeping ends, the event gets at least a full retention period from the day
 * it ended, in the reference zone, so an event long past its planned date is not deleted at once.
 */
export function deletionOf(
	schedule: Schedule,
	lastChange: Temporal.Instant,
	retention: Retention,
	final: FinalTime,
	keeping: Keeping,
): Deletion {
	if (retention === "never") {
		return { kind: "kept", by: "instance" };
	}

	if (keeping.kind === "kept") {
		return { kind: "kept", by: "organizer" };
	}

	const planned = plannedDate(schedule, lastChange, retention, final);

	if (keeping.kind === "not_kept") {
		return { kind: "on", date: planned };
	}

	const floor = keeping.at
		.toZonedDateTimeISO(schedule.referenceZone)
		.toPlainDate()
		.add({ days: retention });

	return { kind: "on", date: Temporal.PlainDate.compare(floor, planned) > 0 ? floor : planned };
}

/**
 * The instant the event expires: the end of its deletion date in the reference zone, or `null`
 * while it is kept.
 */
export function expiresAt(deletion: Deletion, referenceZone: string): Temporal.Instant | null {
	return deletion.kind === "kept"
		? null
		: deletion.date.add({ days: 1 }).toZonedDateTime({ timeZone: referenceZone }).toInstant();
}
