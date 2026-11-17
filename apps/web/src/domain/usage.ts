// Usage counts: Phase 2 rules U1 to U7. This file imports nothing, so that the maintenance pass
// and the usage command run it with plain Node.

/** Age in days at which an event enters the activation counts (U3). */
export const ACTIVATION_AGE_DAYS = 7;

/** Age in days at which an event enters the group size histogram (U4). */
export const GROUP_SIZE_AGE_DAYS = 30;

/** Participants an event needs to count as activated (U3). */
export const ACTIVATED_AT = 2;

/** The largest bucket of the group size histogram: the participant limit (U4). */
export const MAX_GROUP_BUCKET = 100;

/** Upper ends of the buckets of U5 in hours; the last bucket is 7 days or more. */
const FIRST_RESPONSE_LIMITS_HOURS = [1, 6, 24, 72, 168];

const FIRST_RESPONSE_BUCKETS = [
	"under 1 hour",
	"under 6 hours",
	"under 1 day",
	"under 3 days",
	"under 7 days",
	"7 days or more",
];

/** The bucket of U5 (0 to 5) for the time from creation to the first join. */
export function firstResponseBucket(created: Temporal.Instant, joined: Temporal.Instant): number {
	const hours = created.until(joined, { largestUnit: "hours" }).total("hours");
	const bucket = FIRST_RESPONSE_LIMITS_HOURS.findIndex((limit) => hours < limit);

	return bucket === -1 ? FIRST_RESPONSE_LIMITS_HOURS.length : bucket;
}

/**
 * The bucket that holds the median of a histogram (counts by bucket), or `null` when it is
 * empty. With an even total the lower of the two middle values is taken.
 */
export function medianBucket(histogram: ReadonlyMap<number, number>): number | null {
	const total = [...histogram.values()].reduce((sum, count) => sum + count, 0);

	if (total === 0) {
		return null;
	}

	const middle = Math.ceil(total / 2);
	let seen = 0;

	for (const [bucket, count] of [...histogram].toSorted(([a], [b]) => a - b)) {
		seen += count;

		if (seen >= middle) {
			return bucket;
		}
	}

	return null;
}

/** The share of evaluated events that were activated (U7), or `null` with none evaluated. */
export function activationRate(evaluated: number, activated: number): number | null {
	return evaluated === 0 ? null : activated / evaluated;
}

/** One row of the `usage_counts` table. */
export type UsageCount = { day: string; metric: string; bucket: number; count: number };

/** The days from `from` to `to`, both included. */
function daysBetween(from: Temporal.PlainDate, to: Temporal.PlainDate): Temporal.PlainDate[] {
	const days: Temporal.PlainDate[] = [];

	for (let day = from; Temporal.PlainDate.compare(day, to) <= 0; day = day.add({ days: 1 })) {
		days.push(day);
	}

	return days;
}

const HEADER = ["day", "created", "activation", "median group", "median first response"];

/**
 * The table of U7: per day from `from` to `to`, the events created, the activation rate, the
 * median group size and the bucket that holds the median time to first response. A day
 * without data shows a dash.
 */
export function usageReport(
	counts: readonly UsageCount[],
	from: Temporal.PlainDate,
	to: Temporal.PlainDate,
): string {
	// Counts by day, then metric, then bucket.
	const byDay = new Map<string, Map<string, Map<number, number>>>();

	for (const row of counts) {
		const ofDay = byDay.get(row.day) ?? new Map<string, Map<number, number>>();
		const ofMetric = ofDay.get(row.metric) ?? new Map<number, number>();

		ofMetric.set(row.bucket, row.count);
		ofDay.set(row.metric, ofMetric);
		byDay.set(row.day, ofDay);
	}

	const rows = daysBetween(from, to).map((date) => {
		const day = date.toString();
		const histogram = (metric: string) => byDay.get(day)?.get(metric) ?? new Map<number, number>();
		const total = (metric: string) => histogram(metric).get(0) ?? 0;

		const rate = activationRate(total("activation_evaluated"), total("activated"));
		const group = medianBucket(histogram("group_size"));
		const response = medianBucket(histogram("first_response"));

		return [
			day,
			String(total("events_created")),
			rate === null ? "-" : `${Math.round(rate * 100)} %`,
			group === null ? "-" : String(group),
			response === null ? "-" : (FIRST_RESPONSE_BUCKETS[response] ?? "-"),
		];
	});

	const table = [HEADER, ...rows];

	const widths = HEADER.map((_, column) =>
		Math.max(...table.map((row) => (row[column] ?? "").length)),
	);

	return table
		.map((row) =>
			row
				.map((cell, column) => cell.padEnd(widths[column] ?? 0))
				.join("  ")
				.trimEnd(),
		)
		.join("\n");
}
