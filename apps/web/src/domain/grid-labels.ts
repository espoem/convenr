// Text of the grid's headers and slot details.
import { timeLabel, weekdayNames } from "./calendar-labels";
import type { GridLayout } from "./grid-layout";

export type ColumnLabel = {
	/** Abbreviated day name. */
	day: string;
	/** Day and month for a dated column, `null` for a day of the week. */
	date: string | null;
	/** Full name for the slot detail and screen readers. */
	long: string;
};

export type GridView = {
	layout: GridLayout;
	/** Labels in the order of `layout.blocks.flat()`. */
	columns: ColumnLabel[];
	/** Start and end of each row's slot. */
	rows: { start: string; end: string }[];
};

/** The grid with its labels in `locale`. Needs Temporal. */
export function gridView(layout: GridLayout, slotLength: number, locale: string): GridView {
	const names = weekdayNames(locale);

	const columns = layout.blocks.flat().map((column): ColumnLabel => {
		if (column.kind === "weekday") {
			const name = names[column.weekday - 1];

			return { day: name?.short ?? "", date: null, long: name?.long ?? "" };
		}

		const date = Temporal.PlainDate.from(column.date);

		return {
			day: date.toLocaleString(locale, { weekday: "short" }),
			date: date.toLocaleString(locale, { day: "numeric", month: "numeric" }),
			long: date.toLocaleString(locale, { weekday: "long", day: "numeric", month: "long" }),
		};
	});

	const rows = layout.rows.map((minute) => ({
		start: timeLabel(minute, locale),
		end: timeLabel(minute + slotLength, locale),
	}));

	return { layout, columns, rows };
}
