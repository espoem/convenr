import type { CalendarEntry } from "@/domain/calendar";
import { shareUrl } from "@/domain/event-address";

import type { EventView } from "./events";

/** The calendar entry of an event served at `origin`, `undefined` without a final time. */
export function calendarEntryOf(event: EventView, origin: string): CalendarEntry | undefined {
	const { final } = event;

	if (final.kind === "open") {
		return undefined;
	}

	return {
		id: event.id,
		name: event.name,
		description: event.description,
		shareUrl: shareUrl(origin, event.segment),
		start: final.start,
		end: final.end,
		sequence: final.sequence,
	};
}
