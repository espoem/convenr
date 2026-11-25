// The best windows below the grid: the longest runs of slots that suit the most people.
import type { GridLayout } from "./grid-layout";
import { cellLevel, type Level, type Levels, scoreOf, type Tally } from "./levels";

/** A participant of a window: available when every slot is, and if need be otherwise. */
type WindowPerson = { person: number; level: Level };

export type Window = {
	/** Index in `layout.blocks.flat()`. */
	column: number;
	/** First and last row, both included. */
	first: number;
	last: number;
	/** Each participant with a level in every slot of the window, by index in list order. */
	people: WindowPerson[];
};

export type WindowFilters = { minSlots: number; minPeople: number };

const LIMIT = 5;

/** The level of each participant with a level in a cell, by participant index. */
function levelsIn(keys: readonly string[], responses: readonly Levels[]): Map<number, Level> {
	return new Map(
		responses.flatMap((levels, person) => {
			const level = cellLevel(levels, keys);

			return level === null ? [] : [[person, level] as const];
		}),
	);
}

/** Whether two adjacent non-empty dated cells form a contiguous run at `slotLength`. */
function datedFollows(
	previousKeys: readonly string[],
	currentKeys: readonly string[],
	slotLength: number,
): boolean {
	const prev = previousKeys.at(-1);
	const curr = currentKeys[0];

	if (prev === undefined || curr === undefined) {
		return false;
	}

	if (prev.startsWith("w") || curr.startsWith("w")) {
		return true;
	}

	if (previousKeys.length === 1 && currentKeys.length === 1) {
		return Temporal.Instant.from(curr).equals(
			Temporal.Instant.from(prev).add({ minutes: slotLength }),
		);
	}

	return true;
}

/** Whether all collected keys in a candidate window form one contiguous run of slots. */
function isContiguousWindow(cells: readonly string[][], slotLength: number): boolean {
	const keys = cells.flat();
	const firstKey = keys[0];

	if (firstKey === undefined || firstKey.startsWith("w")) {
		return true;
	}

	const instants = keys
		.map((key) => Temporal.Instant.from(key))
		.toSorted((a, b) => Temporal.Instant.compare(a, b));

	return instants.every(
		(instant, index) =>
			index === 0 || instant.equals((instants[index - 1] ?? instant).add({ minutes: slotLength })),
	);
}

/** Row ranges of a column in which every row has a slot and follows the previous one directly. */
function runs(cells: string[][], rows: number[], slotLength: number): [number, number][] {
	const found: [number, number][] = [];
	let start: number | null = null;

	for (const [row, keys] of cells.entries()) {
		const previous = rows[row - 1];
		const previousKeys = cells[row - 1] ?? [];

		const follows =
			previous !== undefined &&
			rows[row] === previous + slotLength &&
			datedFollows(previousKeys, keys, slotLength);

		if (keys.length === 0) {
			start = null;
		} else if (start === null || !follows) {
			start = row;
			found.push([row, row]);
		} else {
			found.splice(-1, 1, [start, row]);
		}
	}

	return found;
}

function isSubset(people: ReadonlyMap<number, Level>, of: ReadonlyMap<number, Level> | undefined) {
	return of !== undefined && [...people.keys()].every((person) => of.has(person));
}

/** The people of a window in the rows `first` onwards, given those of `common` and the next row. */
function narrowed(
	common: ReadonlyMap<number, Level>,
	here: ReadonlyMap<number, Level> | undefined,
): Map<number, Level> {
	return new Map(
		[...common].flatMap(([person, level]) => {
			const next = here?.get(person);

			if (next === undefined) {
				return [];
			}

			return [[person, level === "if_need_be" ? level : next] as const];
		}),
	);
}

/**
 * Every maximal window with at least one person: extending it by a slot at either end
 * would lose one of its people. Levels do not change maximality; heads do.
 */
export function maximalWindows(
	layout: GridLayout,
	slotLength: number,
	participants: readonly { levels: Levels }[],
): Window[] {
	const responses = participants.map((participant) => participant.levels);

	return layout.blocks.flat().flatMap((column, columnIndex) => {
		const people = column.cells.map((keys) => levelsIn(keys, responses));

		return runs(column.cells, layout.rows, slotLength).flatMap(([start, end]) => {
			const found: Window[] = [];

			for (let first = start; first <= end; first += 1) {
				let common = people[first] ?? new Map<number, Level>();

				for (let last = first; last <= end && common.size > 0; last += 1) {
					common = narrowed(common, people[last]);

					const growsLeft = first > start && isSubset(common, people[first - 1]);
					const growsRight = last < end && isSubset(common, people[last + 1]);

					if (
						common.size > 0 &&
						!growsLeft &&
						!growsRight &&
						isContiguousWindow(column.cells.slice(first, last + 1), slotLength)
					) {
						found.push({
							column: columnIndex,
							first,
							last,
							people: [...common]
								.map(([person, level]) => ({ person, level }))
								.toSorted((a, b) => a.person - b.person),
						});
					}
				}
			}

			return found;
		});
	});
}

/** How many of the window's people are at each level. */
export function windowTally(window: Window): Tally {
	const ifNeedBe = window.people.filter((entry) => entry.level === "if_need_be").length;

	return { available: window.people.length - ifNeedBe, ifNeedBe };
}

/** Whether `a` covers the same rows of the same column as `b`. */
export function sameWindow(a: Window | null, b: Window): boolean {
	return a?.column === b.column && a.first === b.first && a.last === b.last;
}

/** The most people in any single window, the starting minimum of the people filter. */
export function mostPeople(windows: readonly Window[]): number {
	return Math.max(0, ...windows.map((window) => window.people.length));
}

/**
 * The windows that pass the filters, at most five: the highest score first, then the most
 * people, then the longest, then the earliest.
 */
export function bestWindows(windows: readonly Window[], filters: WindowFilters): Window[] {
	return windows
		.filter(
			(window) =>
				window.last - window.first + 1 >= filters.minSlots &&
				window.people.length >= filters.minPeople,
		)
		.toSorted(
			(a, b) =>
				scoreOf(windowTally(b)) - scoreOf(windowTally(a)) ||
				b.people.length - a.people.length ||
				b.last - b.first - (a.last - a.first) ||
				a.column - b.column ||
				a.first - b.first,
		)
		.slice(0, LIMIT);
}
