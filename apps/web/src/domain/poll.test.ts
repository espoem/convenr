import { describe, expect, it } from "vitest";

import { bestOptions, MAX_OPTIONS, optionKey, validatePoll } from "./poll";
import type { PollOption, PollSchedule } from "./schedule";

const instant = (iso: string) => Temporal.Instant.from(iso);
const now = instant("2027-03-01T12:00:00Z");

function option(id: string, start: string, end: string): PollOption {
	return { id, start: instant(start), end: instant(end) };
}

const monday = option("a", "2027-04-05T16:00:00Z", "2027-04-05T18:00:00Z");
const tuesday = option("b", "2027-04-06T16:00:00Z", "2027-04-06T18:00:00Z");

function poll(...options: PollOption[]): PollSchedule {
	return { kind: "poll", options, referenceZone: "Europe/Prague" };
}

describe("validatePoll", () => {
	it("accepts 2 to 20 options and refuses fewer or more", () => {
		expect(validatePoll(poll(monday, tuesday), now)).toEqual([]);
		expect(validatePoll(poll(monday), now)).toEqual([
			{ code: "too_few_options", path: ["options"] },
		]);

		const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, index) =>
			option(
				`o${index}`,
				monday.start.add({ hours: index * 24 }).toString(),
				monday.end.add({ hours: index * 24 }).toString(),
			),
		);

		expect(validatePoll(poll(...many), now)).toEqual([
			{ code: "too_many_options", path: ["options"] },
		]);
	});

	it("refuses an option that ends before it starts, on another date or twice", () => {
		const backwards = option("c", "2027-04-07T18:00:00Z", "2027-04-07T16:00:00Z");
		const overnight = option("d", "2027-04-07T20:00:00Z", "2027-04-07T23:00:00Z");
		const again = { ...monday, id: "e" };

		expect(validatePoll(poll(monday, backwards, overnight, again), now)).toEqual([
			{ code: "option_end_not_after_start", path: ["options", 1, "end"] },
			{ code: "option_not_one_day", path: ["options", 2, "end"] },
			{ code: "duplicate_option", path: ["options", 3] },
		]);
	});

	it("lets an option end at the midnight that closes its date", () => {
		const toMidnight = option("c", "2027-04-07T20:00:00Z", "2027-04-07T22:00:00Z");

		expect(validatePoll(poll(monday, toMidnight), now)).toEqual([]);
	});

	it("refuses an added option in the past and keeps one the poll already had", () => {
		const later = instant("2027-04-05T17:00:00Z");

		expect(validatePoll(poll(monday, tuesday), later)).toEqual([
			{ code: "date_in_past", path: ["options", 0, "start"] },
		]);
		expect(validatePoll(poll(monday, tuesday), later, new Set(["a"]))).toEqual([]);
	});
});

describe("bestOptions", () => {
	it("orders the answered options by score, then heads, then start", () => {
		const responses = [
			{ [optionKey(monday)]: "if_need_be", [optionKey(tuesday)]: "available" },
			{ [optionKey(monday)]: "available", [optionKey(tuesday)]: "available" },
		] as const;

		expect(bestOptions(poll(monday, tuesday), responses).map((result) => result.option.id)).toEqual(
			["b", "a"],
		);
		expect(bestOptions(poll(monday, tuesday), [{}])).toEqual([]);
	});
});
