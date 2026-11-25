"use client";

import { useMemo } from "react";

import { maximalWindows, type Window } from "@/domain/best-windows";
import { gridView, type GridView } from "@/domain/grid-labels";
import { datedLayout } from "@/domain/grid-layout";
import { useTemporalReady } from "@/lib/browser-time";

import type { BoardEvent } from "./event-board";

/**
 * The grid the server lays out. A weekday event's grid is the same in every zone (ADR 0002
 * item 9). A dated event's grid is laid out in its reference zone, which the page shows until
 * the browser knows the viewer's zone, and for good without JavaScript.
 */
export type ServerGrid =
	| { kind: "weekday"; view: GridView }
	| { kind: "dated"; inReferenceZone: GridView; windows: Window[] };

/** The grid and its maximal windows. */
export type BoardView = { view: GridView; windows: Window[] };

/**
 * The grid of `event` in `zone` and its maximal windows. A dated event is laid out in `zone`
 * once the browser can; before that, and while `zone` is unknown, the server's layout is shown.
 */
export function useBoardView(
	event: BoardEvent,
	serverGrid: ServerGrid,
	zone: string | null,
	formatLocale: string,
): BoardView {
	const temporalReady = useTemporalReady();

	const view = useMemo(() => {
		if (serverGrid.kind === "weekday") {
			return serverGrid.view;
		}

		return temporalReady && zone !== null
			? gridView(
					datedLayout(event.slots, zone, event.firstDayOfWeek),
					event.slotLength,
					formatLocale,
				)
			: serverGrid.inReferenceZone;
	}, [serverGrid, temporalReady, zone, event, formatLocale]);

	const windows = useMemo(() => {
		if (serverGrid.kind === "dated" && (!temporalReady || zone === null)) {
			return serverGrid.windows;
		}

		return maximalWindows(view.layout, event.slotLength, event.participants);
	}, [serverGrid, temporalReady, zone, view.layout, event.slotLength, event.participants]);

	return { view, windows };
}
