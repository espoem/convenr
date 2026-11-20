// What the event page and the manage page send to the grid in the browser: plain values only,
// because Temporal values do not cross from a server component to a client component.
import type { BoardEvent, ShownFinal } from "@/components/event/event-board";
import type { PollBoardEvent } from "@/components/event/poll-board";
import { gridView, type GridView } from "@/domain/grid-labels";
import { weekdayLayout } from "@/domain/grid-layout";
import { bestOptions, inTimeOrder, optionKey } from "@/domain/poll";
import type { GridSchedule, PollSchedule } from "@/domain/schedule";

import type { EventView } from "./events";

/** An event whose schedule is a grid of slots. */
export type GridEventView = EventView & { schedule: GridSchedule };

export function boardOf(event: GridEventView): BoardEvent {
	const { schedule } = event;

	return {
		id: event.id,
		name: event.name,
		segment: event.segment,
		dated: schedule.days.mode !== "weekdays",
		referenceZone: schedule.referenceZone,
		firstDayOfWeek: schedule.firstDayOfWeek,
		slotLength: schedule.slotLength,
		rowCount: (schedule.dailyEnd - schedule.dailyStart) / schedule.slotLength,
		slots: event.slots,
		participants: event.participants,
		final: shownFinal(event),
	};
}

/** The final time as plain values, with the event's slots inside it. */
export function shownFinal({ final, finalSlots }: EventView): ShownFinal {
	return final.kind === "open"
		? { kind: "open" }
		: {
				kind: "chosen",
				start: final.start.toString(),
				end: final.end.toString(),
				sequence: final.sequence,
				slots: finalSlots,
			};
}

/** An event whose schedule is a poll's options. */
export type PollEventView = EventView & { schedule: PollSchedule };

/** The event tagged by its kind, so that one check selects the grid or the poll view. */
export function byKind(
	event: EventView,
): { kind: "grid"; event: GridEventView } | { kind: "poll"; event: PollEventView } {
	const { schedule } = event;

	return schedule.kind === "grid"
		? { kind: "grid", event: { ...event, schedule } }
		: { kind: "poll", event: { ...event, schedule } };
}

export function pollBoardOf(event: PollEventView): PollBoardEvent {
	const { schedule } = event;
	const levels = event.participants.map((participant) => participant.levels);

	return {
		id: event.id,
		name: event.name,
		segment: event.segment,
		referenceZone: schedule.referenceZone,
		options: inTimeOrder(schedule.options).map((option) => ({
			key: optionKey(option),
			start: option.start.toString(),
			end: option.end.toString(),
		})),
		best: bestOptions(schedule, levels).map((result) => ({
			key: optionKey(result.option),
			people: result.people,
		})),
		slots: event.slots,
		participants: event.participants,
		final: shownFinal(event),
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
