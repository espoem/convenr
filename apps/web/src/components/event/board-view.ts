"use client";

import { useMemo } from "react";

import { maximalWindows, type Window } from "@/domain/best-windows";
import { gridView, type GridView } from "@/domain/grid-labels";
import { datedLayout } from "@/domain/grid-layout";
import { useTemporalReady } from "@/lib/browser-time";

import type { BoardEvent } from "./event-board";

/** The grid, `null` until the browser can lay out a dated one, and its maximal windows. */
export type BoardView = { view: GridView | null; windows: Window[] };

/**
 * The grid of `event` in `zone` and its maximal windows. A weekday event's grid comes laid out
 * from the server (ADR 0002 item 9).
 */
export function useBoardView(
	event: BoardEvent,
	weekdayView: GridView | null,
	zone: string | null,
	formatLocale: string,
): BoardView {
	const temporalReady = useTemporalReady();

	const view = useMemo(() => {
		if (weekdayView !== null) {
			return weekdayView;
		}

		return temporalReady && zone !== null
			? gridView(
					datedLayout(event.slots, zone, event.firstDayOfWeek),
					event.slotLength,
					formatLocale,
				)
			: null;
	}, [weekdayView, temporalReady, zone, event, formatLocale]);

	const windows = useMemo(
		() => (view === null ? [] : maximalWindows(view.layout, event.slotLength, event.participants)),
		[view, event.slotLength, event.participants],
	);

	return { view, windows };
}
