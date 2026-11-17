// Columns, rows and week blocks of the availability grid: spec rules T1, T3 and T4.
import { datedGrid } from "./dated-grid";
import { type DatedSlot, slotKey, type Weekday, weekdaysFrom } from "./schedule";

export type GridColumn =
	| { kind: "date"; date: string; cells: string[][] }
	| { kind: "weekday"; weekday: Weekday; cells: string[][] };

export type GridLayout = {
	/** Minutes after midnight at which each row starts, in display order. */
	rows: number[];
	/** Columns grouped into blocks; a gap separates the blocks. Each cell holds slot keys. */
	blocks: GridColumn[][];
};

const WEEKDAY_KEY = /^w([1-7])-(\d{1,4})$/;

/** A weekday event's grid by rule T3: as stored, with columns from the first day of week. */
export function weekdayLayout(keys: string[], firstDayOfWeek: Weekday): GridLayout {
	const parsed = keys.flatMap((key) => {
		const match = WEEKDAY_KEY.exec(key);

		return match === null ? [] : [{ key, weekday: Number(match[1]), minute: Number(match[2]) }];
	});

	const rows = [...new Set(parsed.map((slot) => slot.minute))].toSorted((a, b) => a - b);

	const columns = weekdaysFrom(firstDayOfWeek).flatMap((weekday): GridColumn[] =>
		parsed.some((slot) => slot.weekday === weekday)
			? [
					{
						kind: "weekday",
						weekday,
						cells: rows.map((minute) =>
							parsed.flatMap((slot) =>
								slot.weekday === weekday && slot.minute === minute ? [slot.key] : [],
							),
						),
					},
				]
			: [],
	);

	return { rows, blocks: [columns] };
}

/** The first date of the calendar week that contains `date`, for a week starting on `first`. */
function weekStart(date: Temporal.PlainDate, first: Weekday): string {
	return date.subtract({ days: (date.dayOfWeek - first + 7) % 7 }).toString();
}

/**
 * A dated event's grid in the viewer's zone by rule T1, with one block per calendar week
 * by rule T4.
 */
export function datedLayout(
	keys: string[],
	viewerZone: string,
	firstDayOfWeek: Weekday,
): GridLayout {
	const slots = keys.map((key): DatedSlot => ({
		kind: "dated",
		start: Temporal.Instant.from(key),
	}));

	const grid = datedGrid(slots, viewerZone);

	const columns = grid.columns.map((date, index) => ({
		week: weekStart(date, firstDayOfWeek),
		column: {
			kind: "date",
			date: date.toString(),
			cells: (grid.cells[index] ?? []).map((cell) => cell.map(slotKey)),
		} satisfies GridColumn,
	}));

	const blocks = [...Map.groupBy(columns, (entry) => entry.week).values()].map((week) =>
		week.map((entry) => entry.column),
	);

	return { rows: grid.rows, blocks };
}

/**
 * Whether a solid line, not a dotted one, closes a row: after the last row, and where the
 * next row starts a new hour or does not follow directly (DESIGN.md rule 3).
 */
export function closesHour(rows: number[], index: number, slotLength: number): boolean {
	const next = rows[index + 1];
	const current = rows[index];

	if (next === undefined || current === undefined) {
		return true;
	}

	return next % 60 === 0 || next !== current + slotLength;
}
