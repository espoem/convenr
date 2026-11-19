// Shared input for the data access layer tests.
import { db } from "@/db/client";
import { events } from "@/db/schema";

import { createEvent, type GridEventInput, type NewEvent, type PollEventInput } from "./events";

export const creationTime = Temporal.Instant.from("2027-03-01T12:00:00Z");

export const pragueEvenings: GridEventInput = {
	kind: "grid",
	name: "Schůzka výboru 2027",
	description: "Kdy se sejdeme?\nV klubovně.",
	days: { mode: "range", first: "2027-04-05", last: "2027-04-06" },
	dailyStart: 17 * 60,
	dailyEnd: 19 * 60,
	slotLength: 60,
	referenceZone: "Europe/Prague",
	firstDayOfWeek: 1,
};

export const mondayEvenings: GridEventInput = {
	...pragueEvenings,
	days: { mode: "weekdays", weekdays: [1, 3] },
};

/** A poll of three evenings in April 2027, in Prague time. */
export const pragueOptions: PollEventInput = {
	kind: "poll",
	name: "Výběr večera",
	description: "",
	referenceZone: "Europe/Prague",
	options: [
		{ start: "2027-04-05T16:00:00Z", end: "2027-04-05T18:00:00Z" },
		{ start: "2027-04-07T16:00:00Z", end: "2027-04-07T18:00:00Z" },
		{ start: "2027-04-09T16:00:00Z", end: "2027-04-09T18:00:00Z" },
	],
};

/** Empties the test database and creates one event from `input`. Returns its id. */
export async function freshEvent(input: NewEvent = pragueEvenings): Promise<string> {
	// Deleting the events cascades to every other table.
	await db().delete(events);

	const created = await createEvent(input, creationTime);

	if (!created.ok) {
		throw new Error(`The test event is invalid: ${JSON.stringify(created.problems)}`);
	}

	return created.event.id;
}
