"use client";

import { Fragment, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { GridView } from "@/domain/grid-labels";
import { closesHour } from "@/domain/grid-layout";
import { cn } from "@/lib/utils";

export type CellRef = { column: number; row: number };

type Edit = {
	selection: ReadonlySet<string>;
	onChange: (next: Set<string>) => void;
};

type AvailabilityGridProps = {
	view: GridView;
	slotLength: number;
	label: string;
	/** Classes that fill a cell holding these slot keys. */
	fill: (keys: readonly string[]) => string;
	/** What a screen reader hears after the cell's day and time. */
	describe: (keys: readonly string[]) => string;
	/** Present in edit mode. */
	edit?: Edit | undefined;
	/** View mode: a cell was pointed at, tapped or focused, or `null` when the pointer left. */
	onInspect?: ((cell: CellRef | null, box: DOMRect | null) => void) | undefined;
	inspected?: CellRef | null | undefined;
	/** Rows `first` to `last` of one column, outlined as one shape. */
	highlight?: { column: number; first: number; last: number } | null | undefined;
};

// An ink edge with a surface strip inside stays visible on every heat step, the darkest included.
const EDGE = "var(--color-ink)";
const GAP = "var(--color-surface)";

function outline(sides: { top: boolean; bottom: boolean }): string {
	const edges = [
		[3, 0],
		[-3, 0],
		...(sides.top ? [[0, 3]] : []),
		...(sides.bottom ? [[0, -3]] : []),
	];

	return [
		...edges.map(([x = 0, y = 0]) => `inset ${x}px ${y}px 0 ${EDGE}`),
		...edges.map(([x = 0, y = 0]) => `inset ${x * 2}px ${y * 2}px 0 ${GAP}`),
	].join(", ");
}

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

function withKeys(base: ReadonlySet<string>, keys: readonly string[], on: boolean): Set<string> {
	const next = new Set(base);

	for (const key of keys) {
		if (on) {
			next.add(key);
		} else {
			next.delete(key);
		}
	}

	return next;
}

/** The cell under a pointer, which may have moved away from the cell where it went down. */
function cellAt(x: number, y: number): CellRef | undefined {
	const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-column]");

	if (element === null || element === undefined) {
		return undefined;
	}

	return { column: Number(element.dataset["column"]), row: Number(element.dataset["row"]) };
}

/** The availability grid of DESIGN.md rule 3: week blocks, days across, times down. */
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
}: AvailabilityGridProps) {
	const table = useRef<HTMLTableElement>(null);
	const cells = useRef(new Map<string, HTMLButtonElement>());
	const gesture = useRef<{ start: CellRef; on: boolean; base: ReadonlySet<string> } | null>(null);
	const [focus, setFocus] = useState<CellRef>({ column: 0, row: 0 });
	const [anchor, setAnchor] = useState<CellRef | null>(null);

	const columns = view.layout.blocks.flat();

	const blockStarts = new Set(
		view.layout.blocks.map((_block, index) =>
			view.layout.blocks.slice(0, index).reduce((sum, block) => sum + block.length, 0),
		),
	);

	const keysOf = (cell: CellRef) => columns[cell.column]?.cells[cell.row] ?? [];

	const isOn = (keys: readonly string[]) =>
		keys.length > 0 && keys.every((key) => edit?.selection.has(key) === true);

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

		const on = !isOn(keys);

		gesture.current = { start: cell, on, base: edit.selection };
		setFocus(cell);
		edit.onChange(withKeys(edit.selection, keys, on));
	}

	function continuePaint(event: PointerEvent<HTMLTableElement>) {
		const current = gesture.current;
		const cell = current === null ? undefined : cellAt(event.clientX, event.clientY);

		if (current === null || cell === undefined || edit === undefined) {
			return;
		}

		edit.onChange(withKeys(current.base, keysWithin(current.start, cell), current.on));
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

			edit.onChange(withKeys(edit.selection, keysWithin(start, focus), !isOn(keysOf(start))));
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
			className="border-separate border-spacing-0 select-none"
		>
			<caption className="sr-only">{label}</caption>
			<thead>
				<tr>
					{/* Below the time labels, so the first label can reach up to its line. */}
					<td aria-hidden className="sticky top-0 left-0 z-[5] bg-background" />
					{columns.map((column, index) => {
						const text = view.columns[index];

						return (
							<Fragment key={column.kind === "date" ? column.date : column.weekday}>
								{index > 0 && blockStarts.has(index) ? (
									<td aria-hidden className="sticky top-0 z-10 w-3 min-w-3 bg-background" />
								) : null}
								<th
									scope="col"
									aria-label={text?.long}
									className="sticky top-0 z-10 min-w-(--cv-cell-min-width) bg-background px-1 pb-1.5 text-center leading-tight font-normal"
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

								return (
									<Fragment key={cellId(cell)}>
										{index > 0 && blockStarts.has(index) ? <td aria-hidden /> : null}
										<td
											style={
												inWindow
													? {
															boxShadow: outline({
																top: row === highlight.first,
																bottom: row === highlight.last,
															}),
														}
													: undefined
											}
											className={cn(
												"h-7 min-w-(--cv-cell-min-width) border-r border-b border-earth p-0 sm:w-18",
												solid ? "[border-bottom-style:solid]" : "[border-bottom-style:dotted]",
												blockStarts.has(index) && "border-l",
												row === 0 && "border-t",
												empty ? "bg-background" : fill(keys),
												marked && "outline-2 -outline-offset-2 outline-ink",
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
													aria-pressed={edit === undefined ? undefined : isOn(keys)}
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
														}
													}}
													className={cn(
														"block h-7 w-full cursor-pointer",
														edit !== undefined && "touch-none",
													)}
												/>
											)}
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
