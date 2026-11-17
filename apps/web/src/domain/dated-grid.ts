import type { DatedSlot } from "./schedule";

export type DatedGrid = {
	/** The viewer's local dates that contain at least one slot, in date order. */
	columns: Temporal.PlainDate[];
	/** The viewer's local times of day, in minutes, at which at least one slot starts. */
	rows: number[];
	/**
	 * Slots by column and row. A cell is usually empty or holds one slot. It holds two when
	 * the viewer's clock moves back and shows the same local time twice on one date.
	 */
	cells: DatedSlot[][][];
};

function cellKey(date: Temporal.PlainDate, minute: number): string {
	return `${date.toString()}/${minute}`;
}

/** The grid of a dated event as a viewer in `viewerZone` sees it, by spec rule T1. */
export function datedGrid(slots: DatedSlot[], viewerZone: string): DatedGrid {
	const placed = slots.map((slot) => {
		const local = slot.start.toZonedDateTimeISO(viewerZone);

		return { slot, date: local.toPlainDate(), minute: local.hour * 60 + local.minute };
	});

	const columns = [
		...new Map(placed.map((cell) => [cell.date.toString(), cell.date])).values(),
	].toSorted(Temporal.PlainDate.compare);

	const rows = [...new Set(placed.map((cell) => cell.minute))].toSorted(
		(left, right) => left - right,
	);

	const byCell = Map.groupBy(placed, (cell) => cellKey(cell.date, cell.minute));

	const cells = columns.map((date) =>
		rows.map((minute) => (byCell.get(cellKey(date, minute)) ?? []).map((cell) => cell.slot)),
	);

	return { columns, rows, cells };
}
