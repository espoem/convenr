// A poll's options: their limits, and the options that suit the most people.
import { headsOf, type Level, type Levels, scoreOf, type Tally } from "./levels";
import { type PollOption, type PollSchedule, type ScheduleIssue, slotKey } from "./schedule";

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 20;

export type PollProblem =
	| "too_few_options"
	| "too_many_options"
	| "option_end_not_after_start"
	| "option_not_one_day"
	| "duplicate_option"
	| "date_in_past";

/** The key a poll option is answered under. */
export function optionKey(option: Pick<PollOption, "id">): string {
	return slotKey({ kind: "option", option: option.id });
}

/** The date of an option in the reference zone. */
export function optionDate(option: Pick<PollOption, "start">, zone: string): Temporal.PlainDate {
	return option.start.toZonedDateTimeISO(zone).toPlainDate();
}

/** Whether the option ends on the date it starts, or at the midnight that closes that date. */
function onOneDay(option: Pick<PollOption, "start" | "end">, zone: string): boolean {
	const date = optionDate(option, zone);
	const midnight = date.add({ days: 1 }).toZonedDateTime({ timeZone: zone }).toInstant();

	return Temporal.Instant.compare(option.end, midnight) <= 0;
}

/**
 * Problems that make a poll invalid, each at the field it concerns. An option whose id is in
 * `keptIds` was there before the change, so it may lie in the past; an added one may not.
 */
export function validatePoll(
	schedule: Pick<PollSchedule, "referenceZone"> & {
		options: readonly (Pick<PollOption, "start" | "end"> & { id?: string | undefined })[];
	},
	now: Temporal.Instant,
	keptIds: ReadonlySet<string> = new Set(),
): ScheduleIssue<PollProblem>[] {
	const { options, referenceZone } = schedule;

	if (options.length < MIN_OPTIONS) {
		return [{ code: "too_few_options", path: ["options"] }];
	}

	if (options.length > MAX_OPTIONS) {
		return [{ code: "too_many_options", path: ["options"] }];
	}

	const seen = new Set<string>();

	return options.flatMap((option, index): ScheduleIssue<PollProblem>[] => {
		const at = (field: string) => ["options", index, field];

		if (Temporal.Instant.compare(option.end, option.start) <= 0) {
			return [{ code: "option_end_not_after_start", path: at("end") }];
		}

		if (!onOneDay(option, referenceZone)) {
			return [{ code: "option_not_one_day", path: at("end") }];
		}

		const times = `${option.start.toString()}/${option.end.toString()}`;
		const repeated = seen.has(times);

		seen.add(times);

		if (repeated) {
			return [{ code: "duplicate_option", path: ["options", index] }];
		}

		const kept = option.id !== undefined && keptIds.has(option.id);

		return !kept && Temporal.Instant.compare(option.start, now) < 0
			? [{ code: "date_in_past", path: at("start") }]
			: [];
	});
}

/** Options in time order: by start, then by end. */
export function inTimeOrder<Option extends Pick<PollOption, "start" | "end">>(
	options: readonly Option[],
): Option[] {
	return options.toSorted(
		(left, right) =>
			Temporal.Instant.compare(left.start, right.start) ||
			Temporal.Instant.compare(left.end, right.end),
	);
}

/** The people who answered an option, by participant index, with their level. */
export type OptionResult = {
	option: PollOption;
	people: { person: number; level: Level }[];
};

export function optionTally(result: OptionResult): Tally {
	const ifNeedBe = result.people.filter(({ level }) => level === "if_need_be").length;

	return { available: result.people.length - ifNeedBe, ifNeedBe };
}

const LIMIT = 5;

/**
 * The options that suit the most people: every option somebody answered, the highest score
 * first, then the most people, then the earliest. At most five.
 */
export function bestOptions(
	schedule: PollSchedule,
	responses: readonly Levels[],
	minPeople = 1,
): OptionResult[] {
	const results = schedule.options.map((option): OptionResult => {
		const key = optionKey(option);

		return {
			option,
			people: responses.flatMap((levels, person) => {
				const level = levels[key];

				return level === undefined ? [] : [{ person, level }];
			}),
		};
	});

	return results
		.filter((result) => result.people.length > 0 && result.people.length >= minPeople)
		.toSorted((left, right) => {
			const a = optionTally(left);
			const b = optionTally(right);

			return (
				scoreOf(b) - scoreOf(a) ||
				headsOf(b) - headsOf(a) ||
				Temporal.Instant.compare(left.option.start, right.option.start)
			);
		})
		.slice(0, LIMIT);
}
