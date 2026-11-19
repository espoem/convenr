import { describe, expect, it } from "vitest";

import {
	createClient,
	createEvent,
	deleteEvent,
	type Event,
	getEvent,
	getWindows,
	join,
	saveAvailability,
	type Slot,
} from "../src/index.js";

const instance = process.env["CONVENR_URL"];

if (instance === undefined) {
	throw new Error("Set CONVENR_URL to the address of a running instance.");
}

const client = createClient({ baseUrl: new URL("/api/v1", instance).toString() });

function slotKey(slot: Slot): string {
	return "start" in slot ? slot.start : `${slot.weekday}/${slot.minute}`;
}

/** The longest run of consecutive slots in which every participant is available. */
function overlap(event: Event): Slot[] {
	const sets = event.participants.map(
		(participant) => new Set(participant.availability.map(slotKey)),
	);

	let best: Slot[] = [];
	let run: Slot[] = [];

	for (const slot of event.schedule.slots) {
		const key = slotKey(slot);

		run = sets.every((set) => set.has(key)) ? [...run, slot] : [];

		if (run.length > best.length) {
			best = run;
		}
	}

	return best;
}

describe("the TypeScript SDK against a running instance", () => {
	it("creates a dated event, joins two people and finds their overlap", async () => {
		const day = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 7 }).toString();

		const created = await createEvent({
			client,
			throwOnError: true,
			body: {
				name: "Retrospective",
				referenceZone: "Europe/Prague",
				schedule: {
					mode: "dates",
					dates: [day],
					dailyStart: "09:00",
					dailyEnd: "13:00",
					slotMinutes: 30,
				},
			},
		});

		const { event, adminSecret } = created.data;

		if (event.schedule.mode !== "dates") {
			throw new Error("The event was made on dates.");
		}

		const { slots } = event.schedule;

		expect(slots).toHaveLength(8);

		const ada = await join({
			client,
			throwOnError: true,
			path: { id: event.id },
			body: { name: "Ada" },
		});

		const bob = await join({
			client,
			throwOnError: true,
			path: { id: event.id },
			body: { name: "Bob" },
		});

		await saveAvailability({
			client,
			throwOnError: true,
			auth: ada.data.participantToken,
			path: { id: event.id },
			body: { availability: slots.slice(0, 6) },
		});
		await saveAvailability({
			client,
			throwOnError: true,
			auth: bob.data.participantToken,
			path: { id: event.id },
			body: { availability: slots.slice(2, 8) },
		});

		const read = await getEvent({ client, throwOnError: true, path: { id: event.id } });
		const windows = await getWindows({ client, throwOnError: true, path: { id: event.id } });
		const computed = overlap(read.data);

		expect(computed).toStrictEqual(slots.slice(2, 6));
		expect(windows.data.windows[0]?.slots).toStrictEqual(computed);
		expect(windows.data.windows[0]?.participantIds.toSorted()).toStrictEqual(
			[ada.data.participant.id, bob.data.participant.id].toSorted(),
		);

		const refused = await deleteEvent({
			client,
			auth: ada.data.participantToken,
			path: { id: event.id },
		});

		expect(refused.response?.status).toBe(403);
		expect(refused.error).toMatchObject({ code: "wrong_secret_kind" });

		const etag = read.response.headers.get("ETag");

		expect(etag).not.toBeNull();

		const unchanged = await getEvent({
			client,
			path: { id: event.id },
			headers: { "If-None-Match": etag ?? "" },
		});

		expect(unchanged.response?.status).toBe(304);

		await deleteEvent({ client, throwOnError: true, auth: adminSecret, path: { id: event.id } });
	});
});
