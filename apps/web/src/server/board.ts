// What the event page and the manage page send to the grid in the browser: plain values only,
// because Temporal values do not cross from a server component to a client component.
import type { BoardEvent } from "@/components/event/event-board";
import { gridView, type GridView } from "@/domain/grid-labels";
import { weekdayLayout } from "@/domain/grid-layout";
import type { GridSchedule } from "@/domain/schedule";

import type { EventView } from "./events";

/** An event whose schedule is a grid of slots. */
export type GridEventView = EventView & { schedule: GridSchedule };

export function isGridEvent(event: EventView): event is GridEventView {
	return event.schedule.kind === "grid";
}

export function boardOf(event: GridEventView): BoardEvent {
	const { schedule, final } = event;

	return {
		id: event.id,
		name: event.name,
		segment: event.segment,
		dated: schedule.days.mode !== "weekdays",
		referenceZone: schedule.referenceZone,
		firstDayOfWeek: schedule.firstDayOfWeek,
		slotLength: schedule.slotLength,
		version: event.version,
		rowCount: (schedule.dailyEnd - schedule.dailyStart) / schedule.slotLength,
		slots: event.slots,
		participants: event.participants,
		final:
			final.kind === "open"
				? { kind: "open" }
				: {
						kind: "chosen",
						start: final.start.toString(),
						end: final.end.toString(),
						sequence: final.sequence,
						slots: event.finalSlots,
					},
	};
}

/** A weekday event's grid, laid out by the server (ADR 0002 item 9); `null` for a dated event. */
export function weekdayViewOf(event: GridEventView, formatLocale: string): GridView | null {
	const { schedule } = event;

	return schedule.days.mode === "weekdays"
		? gridView(
				weekdayLayout(event.slots, schedule.firstDayOfWeek),
				schedule.slotLength,
				formatLocale,
			)
		: null;
}
