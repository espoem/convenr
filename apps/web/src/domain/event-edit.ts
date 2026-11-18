// Changing an event's schedule: Phase 2 rules M3 to M5.
import {
	type Schedule,
	type ScheduleProblem,
	scheduleDates,
	scheduleSlots,
	type Slot,
	slotKey,
	validateSchedule,
} from "./schedule";

export type EditProblem = ScheduleProblem | "field_locked";

/**
 * Problems of changing `before` into `after`. Once the event has participants, slot length,
 * day mode and reference zone stay as they are (M3). Dates the event already had may lie in the
 * past; added dates may not (M4).
 */
export function editProblems(
	before: Schedule,
	after: Schedule,
	hasParticipants: boolean,
	now: Temporal.Instant,
): EditProblem[] {
	const locked =
		hasParticipants &&
		(after.slotLength !== before.slotLength ||
			after.days.mode !== before.days.mode ||
			after.referenceZone !== before.referenceZone);

	const problems: EditProblem[] = validateSchedule(after, now, scheduleDates(before));

	return locked ? ["field_locked", ...problems] : problems;
}

/** The slots of `before` that `after` no longer has (M5). */
export function removedSlots(before: Schedule, after: Schedule): Slot[] {
	const kept = new Set(scheduleSlots(after).map((slot) => slotKey(slot)));

	return scheduleSlots(before).filter((slot) => !kept.has(slotKey(slot)));
}
