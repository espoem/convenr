// Changing an event's schedule: what stays fixed once people joined, and which slots disappear.
import { type PollProblem, validatePoll } from "./poll";
import {
	type Schedule,
	type ScheduleIssue,
	type ScheduleProblem,
	scheduleDates,
	scheduleSlots,
	type Slot,
	slotKey,
	validateSchedule,
} from "./schedule";

export type EditProblem = ScheduleProblem | PollProblem | "field_locked" | "unknown_option";

type Locked = { path: (string | number)[]; differs: boolean };

/** The problems of a valid new schedule. */
export function scheduleProblems(
	schedule: Schedule,
	now: Temporal.Instant,
): ScheduleIssue<EditProblem>[] {
	return schedule.kind === "poll" ? validatePoll(schedule, now) : validateSchedule(schedule, now);
}

/**
 * Problems of changing `before` into `after`, each at the field it concerns. Once the event has
 * participants, its kind and reference zone stay as they are, and so do a grid's slot length
 * and day mode. Dates and options the event already had may lie in the past; added ones may not.
 */
export function editProblems(
	before: Schedule,
	after: Schedule,
	hasParticipants: boolean,
	now: Temporal.Instant,
): ScheduleIssue<EditProblem>[] {
	const changed: Locked[] = [
		{ path: ["kind"], differs: after.kind !== before.kind },
		{ path: ["referenceZone"], differs: after.referenceZone !== before.referenceZone },
	];

	if (before.kind === "grid" && after.kind === "grid") {
		changed.push(
			{ path: ["slotLength"], differs: after.slotLength !== before.slotLength },
			{ path: ["days", "mode"], differs: after.days.mode !== before.days.mode },
		);
	}

	const locked = hasParticipants
		? changed.flatMap(({ path, differs }) =>
				differs ? [{ code: "field_locked" as const, path }] : [],
			)
		: [];

	return [...locked, ...afterProblems(before, after, now)];
}

function afterProblems(
	before: Schedule,
	after: Schedule,
	now: Temporal.Instant,
): ScheduleIssue<EditProblem>[] {
	if (after.kind === "poll") {
		const kept = new Set(before.kind === "poll" ? before.options.map((option) => option.id) : []);

		return validatePoll(after, now, kept);
	}

	return validateSchedule(after, now, before.kind === "grid" ? scheduleDates(before) : new Set());
}

/** The slots of `before` that `after` no longer has. */
export function removedSlots(before: Schedule, after: Schedule): Slot[] {
	const kept = new Set(scheduleSlots(after).map((slot) => slotKey(slot)));

	return scheduleSlots(before).filter((slot) => !kept.has(slotKey(slot)));
}
