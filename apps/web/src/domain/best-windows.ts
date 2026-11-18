// The best windows below the grid: the longest runs of slots that suit the most people.
import type { GridLayout } from "./grid-layout";

export type Window = {
	/** Index in `layout.blocks.flat()`. */
	column: number;
	/** First and last row, both included. */
	first: number;
	last: number;
	/** Indexes of the participants available in every slot of the window, in list order. */
	people: number[];
};

export type WindowFilters = { minSlots: number; minPeople: number };

const LIMIT = 5;

/** The participants available in a cell: in each of its slots, of which there can be two. */
function availableIn(keys: readonly string[], available: ReadonlySet<string>[]): Set<number> {
	return new Set(
		available.flatMap((slots, person) =>
			keys.length > 0 && keys.every((key) => slots.has(key)) ? [person] : [],
		),
	);
}

/** Row ranges of a column in which every row has a slot and follows the previous one directly. */
function runs(cells: string[][], rows: number[], slotLength: number): [number, number][] {
	const found: [number, number][] = [];
	let start: number | null = null;

	for (const [row, keys] of cells.entries()) {
		const previous = rows[row - 1];
		const follows = previous !== undefined && rows[row] === previous + slotLength;

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

function isSubset(people: ReadonlySet<number>, of: ReadonlySet<number> | undefined): boolean {
	return of !== undefined && [...people].every((person) => of.has(person));
}

/**
 * Every maximal window with at least one person: extending it by a slot at either end
 * would lose one of its people.
 */
export function maximalWindows(
	layout: GridLayout,
	slotLength: number,
	participants: readonly { available: readonly string[] }[],
): Window[] {
	const available = participants.map((participant) => new Set(participant.available));

	return layout.blocks.flat().flatMap((column, columnIndex) => {
		const people = column.cells.map((keys) => availableIn(keys, available));

		return runs(column.cells, layout.rows, slotLength).flatMap(([start, end]) => {
			const found: Window[] = [];

			for (let first = start; first <= end; first += 1) {
				let common = people[first] ?? new Set<number>();

				for (let last = first; last <= end && common.size > 0; last += 1) {
					const here = people[last];

					common = new Set([...common].filter((person) => here?.has(person) === true));

					const growsLeft = first > start && isSubset(common, people[first - 1]);
					const growsRight = last < end && isSubset(common, people[last + 1]);

					if (common.size > 0 && !growsLeft && !growsRight) {
						found.push({
							column: columnIndex,
							first,
							last,
							people: [...common].toSorted((a, b) => a - b),
						});
					}
				}
			}

			return found;
		});
	});
}

/** Whether `a` covers the same rows of the same column as `b`. */
export function sameWindow(a: Window | null, b: Window): boolean {
	return a?.column === b.column && a.first === b.first && a.last === b.last;
}

/** The most people in any single window, the starting minimum of the people filter. */
export function mostPeople(windows: readonly Window[]): number {
	return Math.max(0, ...windows.map((window) => window.people.length));
}

/** The windows that pass the filters, at most five, the most people and the longest first. */
export function bestWindows(windows: readonly Window[], filters: WindowFilters): Window[] {
	return windows
		.filter(
			(window) =>
				window.last - window.first + 1 >= filters.minSlots &&
				window.people.length >= filters.minPeople,
		)
		.toSorted(
			(a, b) =>
				b.people.length - a.people.length ||
				b.last - b.first - (a.last - a.first) ||
				a.column - b.column ||
				a.first - b.first,
		)
		.slice(0, LIMIT);
}
