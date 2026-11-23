import { describe, expect, it } from "vitest";

import { firstResponseBucket, medianBucket, shareOf, usageReport } from "./usage";

const created = Temporal.Instant.from("2027-03-01T12:00:00Z");
const after = (hours: number) => created.add({ minutes: Math.round(hours * 60) });

describe("firstResponseBucket", () => {
	it("puts each time in the first bucket whose upper end it stays under", () => {
		expect(firstResponseBucket(created, after(0))).toBe(0);
		expect(firstResponseBucket(created, after(0.99))).toBe(0);
		expect(firstResponseBucket(created, after(1))).toBe(1);
		expect(firstResponseBucket(created, after(23.9))).toBe(2);
		expect(firstResponseBucket(created, after(24))).toBe(3);
		expect(firstResponseBucket(created, after(71))).toBe(3);
		expect(firstResponseBucket(created, after(167))).toBe(4);
		expect(firstResponseBucket(created, after(168))).toBe(5);
		expect(firstResponseBucket(created, after(2000))).toBe(5);
	});
});

describe("medianBucket", () => {
	it("finds the bucket that holds the middle value", () => {
		expect(medianBucket(new Map([[3, 1]]))).toBe(3);
		expect(
			medianBucket(
				new Map([
					[5, 2],
					[0, 1],
					[2, 1],
				]),
			),
		).toBe(2);
		expect(medianBucket(new Map([[4, 0]]))).toBeNull();
		expect(medianBucket(new Map())).toBeNull();
	});
});

describe("shareOf", () => {
	it("is the share of a part of the events, and absent without events", () => {
		expect(shareOf(4, 1)).toBe(0.25);
		expect(shareOf(0, 0)).toBeNull();
	});
});

describe("usageReport", () => {
	it("prints one line per day of the range, with a dash where a day has no data", () => {
		const report = usageReport(
			[
				{ day: "2027-03-01", metric: "events_created", bucket: 0, count: 3 },
				{ day: "2027-03-01", metric: "first_response", bucket: 0, count: 1 },
				{ day: "2027-03-01", metric: "first_response", bucket: 4, count: 2 },
				{ day: "2027-03-02", metric: "activation_evaluated", bucket: 0, count: 4 },
				{ day: "2027-03-02", metric: "activated", bucket: 0, count: 1 },
				{ day: "2027-03-02", metric: "group_size", bucket: 0, count: 1 },
				{ day: "2027-03-02", metric: "group_size", bucket: 5, count: 2 },
				{ day: "2027-03-02", metric: "finalized", bucket: 0, count: 1 },
				{ day: "2027-03-02", metric: "time_to_final", bucket: 2, count: 1 },
				{ day: "2027-03-01", metric: "accounts_created", bucket: 0, count: 2 },
				{ day: "2027-03-02", metric: "organizers_evaluated", bucket: 0, count: 4 },
				{ day: "2027-03-02", metric: "organizers_returned", bucket: 0, count: 3 },
			],
			Temporal.PlainDate.from("2027-03-01"),
			Temporal.PlainDate.from("2027-03-03"),
		);

		expect(report.split("\n")).toEqual([
			"day         created  activation  median group  median first response  finalized  median time to final  accounts  returning",
			"2027-03-01  3        -           -             under 7 days           -          -                     2         -",
			"2027-03-02  0        25 %        5             -                      33 %       under 1 day           0         75 %",
			"2027-03-03  0        -           -             -                      -          -                     0         -",
		]);
	});
});
