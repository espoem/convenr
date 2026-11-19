"use client";

import { FlagIcon } from "@phosphor-icons/react";
import {
	Fragment,
	useLayoutEffect,
	useRef,
	useState,
	type KeyboardEvent,
	type PointerEvent,
} from "react";

import type { GridView } from "@/domain/grid-labels";
import { closesHour } from "@/domain/grid-layout";
import type { HeatStep } from "@/domain/heat";
import {
	type Brush,
	cellLevel,
	type Level,
	type Levels,
	pressedLevel,
	withLevel,
} from "@/domain/levels";
import { cn } from "@/lib/utils";

export type CellRef = { column: number; row: number };

type Edit = {
	levels: Levels;
	brush: Brush;
	onChange: (next: Levels) => void;
};

/** How a cell is filled: a heat step, or the hatching of a slot at if need be. */
export type CellFill = HeatStep | "if_need_be";

type AvailabilityGridProps = {
	view: GridView;
	slotLength: number;
	label: string;
	/** How a cell holding these slot keys is filled. */
	fill: (keys: readonly string[]) => CellFill;
	/** What a screen reader hears after the cell's day and time. */
	describe: (keys: readonly string[]) => string;
	/** Present in edit mode. */
	edit?: Edit | undefined;
	/** View mode: a cell was pointed at, tapped or focused, or `null` when the pointer left. */
	onInspect?: ((cell: CellRef | null, box: DOMRect | null) => void) | undefined;
	inspected?: CellRef | null | undefined;
	/** Rows `first` to `last` of one column, outlined as one shape. */
	highlight?: { column: number; first: number; last: number } | null | undefined;
	/** The slots of the final time, sewn shut, and the flag's accessible name. */
	final?: { keys: ReadonlySet<string>; label: string } | undefined;
	/** View mode: a cell was clicked, or pressed with the keyboard. */
	onPick?: ((cell: CellRef) => void) | undefined;
};

type FlagSide = "right" | "left" | "inside";

/** The flag stands beside the final time's first cell, on a side that keeps it over day columns. */
function flagSide(column: number, columns: number): FlagSide {
	if (column < columns - 1) {
		return "right";
	}

	return column > 0 ? "left" : "inside";
}

// A day column never grows past this, so a short event does not stretch across a wide screen.
const MAX_COLUMN = "6rem";

// Wide enough for the longest time label in every locale ("10:00 PM"), so a language
// switch does not move the grid.
const TIME_COLUMN = "4.5rem";

const BLOCK_GAP = "0.75rem";

const ARROWS = new Map([
	["ArrowLeft", { column: -1, row: 0 }],
	["ArrowRight", { column: 1, row: 0 }],
	["ArrowUp", { column: 0, row: -1 }],
	["ArrowDown", { column: 0, row: 1 }],
]);

function cellId(cell: CellRef): string {
	return `${cell.column}:${cell.row}`;
}

function within(cell: CellRef, from: CellRef, to: CellRef): boolean {
	return (
		cell.column >= Math.min(from.column, to.column) &&
		cell.column <= Math.max(from.column, to.column) &&
		cell.row >= Math.min(from.row, to.row) &&
		cell.row <= Math.max(from.row, to.row)
	);
}

/** The cell under a pointer, which may have moved away from the cell where it went down. */
function cellAt(x: number, y: number): CellRef | undefined {
	const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column]");

	if (element === null || element === undefined) {
		return undefined;
	}

	return { column: Number(element.dataset["column"]), row: Number(element.dataset["row"]) };
}

/** Gives the table the size of the hatching pattern and each cell its place in it. */
function placeHatching(grid: HTMLTableElement): void {
	const box = grid.getBoundingClientRect();

	grid.style.setProperty("--hatch-width", `${box.width}px`);
	grid.style.setProperty("--hatch-height", `${box.height}px`);

	for (const cell of grid.querySelectorAll<HTMLElement>(".cv-cell")) {
		const own = cell.getBoundingClientRect();

		cell.style.setProperty("--hatch-x", `${own.left - box.left}px`);
		cell.style.setProperty("--hatch-y", `${own.top - box.top}px`);
	}
}

/** The availability grid: week blocks, days across, times down. */
export function AvailabilityGrid({
	view,
	slotLength,
	label,
	fill,
	describe,
	edit,
	onInspect,
	inspected,
	highlight,
	final,
	onPick,
}: AvailabilityGridProps) {
	const table = useRef<HTMLTableElement>(null);
	const cells = useRef(new Map<string, HTMLButtonElement>());
	const gesture = useRef<{ start: CellRef; level: Level | null; base: Levels } | null>(null);
	const [focus, setFocus] = useState<CellRef>({ column: 0, row: 0 });
	const [anchor, setAnchor] = useState<CellRef | null>(null);

	const columns = view.layout.blocks.flat();

	// The hatching of if need be runs on from cell to cell: the table says how big the one
	// pattern is and each cell where it sits in it. Column widths follow the screen and the
	// cells follow the view, so the grid measures again when either changes.
	useLayoutEffect(() => {
		const grid = table.current;

		if (grid === null) {
			return;
		}

		const place = () => placeHatching(grid);

		place();

		const resized = new ResizeObserver(place);
		const rebuilt = new MutationObserver(place);

		resized.observe(grid);
		rebuilt.observe(grid, { childList: true, subtree: true });

		return () => {
			resized.disconnect();
			rebuilt.disconnect();
		};
	}, []);

	const blockStarts = new Set(
		view.layout.blocks.map((_block, index) =>
			view.layout.blocks.slice(0, index).reduce((sum, block) => sum + block.length, 0),
		),
	);

	const gaps = view.layout.blocks.length - 1;

	const lastRow = view.layout.rows.length - 1;

	// Equal day columns that fill the width, from the minimum cell up to MAX_COLUMN.
	const width = (column: string) =>
		`calc(${TIME_COLUMN} + ${columns.length} * ${column} + ${gaps} * ${BLOCK_GAP})`;

	const keysOf = (cell: CellRef) => columns[cell.column]?.cells[cell.row] ?? [];

	const levelOf = (keys: readonly string[]) =>
		edit === undefined ? null : cellLevel(edit.levels, keys);

	const inFinal = (cell: CellRef) => keysOf(cell).some((key) => final?.keys.has(key) === true);

	// The final time's first cell in reading order of the columns, which carries the flag.
	const flagCell = (() => {
		for (const [column, day] of columns.entries()) {
			const row = day.cells.findIndex((_keys, index) => inFinal({ column, row: index }));

			if (row !== -1) {
				return { column, row };
			}
		}

		return null;
	})();

	function keysWithin(from: CellRef, to: CellRef): string[] {
		return columns.flatMap((column, columnIndex) =>
			column.cells.flatMap((keys, row) =>
				within({ column: columnIndex, row }, from, to) ? keys : [],
			),
		);
	}

	function startPaint(cell: CellRef, event: PointerEvent<HTMLButtonElement>) {
		const keys = keysOf(cell);

		if (edit === undefined || keys.length === 0 || event.button !== 0) {
			return;
		}

		event.preventDefault();
		table.current?.setPointerCapture(event.pointerId);

		const level = pressedLevel(levelOf(keys), edit.brush);

		gesture.current = { start: cell, level, base: edit.levels };
		setFocus(cell);
		edit.onChange(withLevel(edit.levels, keys, level));
	}

	function continuePaint(event: PointerEvent<HTMLTableElement>) {
		const current = gesture.current;
		const cell = current === null ? undefined : cellAt(event.clientX, event.clientY);

		if (current === null || cell === undefined || edit === undefined) {
			return;
		}

		edit.onChange(withLevel(current.base, keysWithin(current.start, cell), current.level));
	}

	function inspect(cell: CellRef, element: HTMLElement) {
		onInspect?.(cell, element.getBoundingClientRect());
	}

	function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
		const step = ARROWS.get(event.key);

		if (step !== undefined) {
			event.preventDefault();

			const next = {
				column: Math.min(Math.max(focus.column + step.column, 0), columns.length - 1),
				row: Math.min(Math.max(focus.row + step.row, 0), view.layout.rows.length - 1),
			};

			setAnchor(edit !== undefined && event.shiftKey ? (anchor ?? focus) : null);
			setFocus(next);
			cells.current.get(cellId(next))?.focus();

			return;
		}

		if (event.key === "Escape") {
			setAnchor(null);
			onInspect?.(null, null);

			return;
		}

		if (edit !== undefined && (event.key === " " || event.key === "Enter")) {
			event.preventDefault();

			const start = anchor ?? focus;

			edit.onChange(
				withLevel(
					edit.levels,
					keysWithin(start, focus),
					pressedLevel(levelOf(keysOf(start)), edit.brush),
				),
			);
			setAnchor(null);
		}
	}

	function endPaint() {
		gesture.current = null;
	}

	return (
		<table
			ref={table}
			onPointerMove={continuePaint}
			onPointerUp={endPaint}
			onPointerCancel={endPaint}
			onPointerLeave={(event) => {
				if (event.pointerType === "mouse" && edit === undefined) {
					onInspect?.(null, null);
				}
			}}
			style={{
				width: "100%",
				minWidth: width("var(--cv-cell-min-width)"),
				maxWidth: width(MAX_COLUMN),
			}}
			className="table-fixed border-separate border-spacing-0 select-none"
		>
			<caption className="sr-only">{label}</caption>
			<thead>
				<tr>
					{/* Below the time labels, so the first label can reach up to its line. */}
					<td
						aria-hidden
						style={{ width: TIME_COLUMN }}
						className="sticky top-0 left-0 z-[5] bg-background"
					/>
					{columns.map((column, index) => {
						const text = view.columns[index];

						return (
							<Fragment key={column.kind === "date" ? column.date : column.weekday}>
								{index > 0 && blockStarts.has(index) ? (
									<td
										aria-hidden
										style={{ width: BLOCK_GAP }}
										className="sticky top-0 z-10 bg-background"
									/>
								) : null}
								<th
									scope="col"
									aria-label={text?.long}
									className="sticky top-0 z-10 bg-background px-1 pb-1.5 text-center leading-tight font-normal"
								>
									<span aria-hidden className="block text-sm">
										{text?.day}
									</span>
									{text?.date === null ? null : (
										<span
											aria-hidden
											className="block font-semibold whitespace-nowrap tabular-nums"
										>
											{text?.date}
										</span>
									)}
								</th>
							</Fragment>
						);
					})}
				</tr>
			</thead>
			<tbody>
				{view.layout.rows.map((minute, row) => {
					const time = view.rows[row];
					const solid = closesHour(view.layout.rows, row, slotLength);

					return (
						<tr key={minute}>
							<th
								scope="row"
								className="sticky left-0 z-10 bg-background pr-2 text-right align-top text-sm font-normal text-ink-muted tabular-nums"
							>
								<span
									className={cn(
										"relative -top-[0.7em] block whitespace-nowrap",
										row > 0 && minute % 60 !== 0 && "sr-only",
									)}
								>
									{time?.start}
								</span>
							</th>
							{columns.map((column, index) => {
								const cell = { column: index, row };
								const keys = column.cells[row] ?? [];
								const empty = keys.length === 0;

								const marked =
									(anchor !== null && within(cell, anchor, focus)) ||
									(inspected?.column === index && inspected.row === row);

								const inWindow =
									highlight?.column === index && row >= highlight.first && row <= highlight.last;

								// The edges of the stitched best-window mark that this cell carries.
								const window = inWindow
									? [row === highlight.first && "top", row === highlight.last && "bottom"]
											.filter(Boolean)
											.join(" ") || "middle"
									: undefined;

								const sewn = inFinal(cell)
									? [
											!inFinal({ column: index, row: row - 1 }) && "top",
											!inFinal({ column: index, row: row + 1 }) && "bottom",
										]
											.filter(Boolean)
											.join(" ")
									: undefined;

								const flagged = flagCell?.column === index && flagCell.row === row;

								return (
									<Fragment key={cellId(cell)}>
										{index > 0 && blockStarts.has(index) ? <td aria-hidden /> : null}
										<td
											data-fill={empty ? undefined : fill(keys)}
											data-half={solid ? undefined : ""}
											data-block-end={
												index === columns.length - 1 || blockStarts.has(index + 1) ? "" : undefined
											}
											data-last-row={row === lastRow ? "" : undefined}
											data-window={window}
											data-marked={marked ? "" : undefined}
											className={cn(
												"cv-cell h-7 p-0",
												blockStarts.has(index) && "border-l border-l-earth",
												row === 0 && "border-t border-t-earth",
											)}
										>
											{empty ? null : (
												<button
													ref={(element) => {
														if (element === null) {
															cells.current.delete(cellId(cell));
														} else {
															cells.current.set(cellId(cell), element);
														}
													}}
													type="button"
													data-column={index}
													data-row={row}
													tabIndex={focus.column === index && focus.row === row ? 0 : -1}
													aria-pressed={edit === undefined ? undefined : levelOf(keys) !== null}
													aria-label={`${view.columns[index]?.long ?? ""}, ${time?.start ?? ""}–${time?.end ?? ""}, ${describe(keys)}`}
													onKeyDown={keyDown}
													onFocus={(event) => {
														setFocus(cell);

														if (edit === undefined) {
															inspect(cell, event.currentTarget);
														}
													}}
													onPointerDown={(event) => startPaint(cell, event)}
													onPointerEnter={(event) => {
														if (edit === undefined && event.pointerType === "mouse") {
															inspect(cell, event.currentTarget);
														}
													}}
													onClick={(event) => {
														if (edit === undefined) {
															inspect(cell, event.currentTarget);
															onPick?.(cell);
														}
													}}
													className={cn(
														"cv-cell-button block h-7 w-full cursor-pointer",
														edit !== undefined && "touch-none",
													)}
												/>
											)}
											{sewn === undefined ? null : <span className="cv-final" data-edge={sewn} />}
											{flagged && final !== undefined ? (
												<span className="cv-final-flag" data-side={flagSide(index, columns.length)}>
													<FlagIcon aria-hidden weight="fill" size={14} />
													<span className="sr-only">{final.label}</span>
												</span>
											) : null}
										</td>
									</Fragment>
								);
							})}
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
