import { describe, expect, it } from "vitest";

import {
	createClient,
	createEvent,
	deleteEvent,
	type Event,
	getEvent,
	getFinalCalendar,
	getWindows,
	join,
	pickFinal,
	saveAvailability,
	type Slot,
} from "../src/index.js";

const instance = process.env["CONVENR_URL"];

if (instance === undefined) {
	throw new Error("Set CONVENR_URL to the address of a running instance.");
}

const client = createClient({ baseUrl: new URL("/api/v1", instance).toString() });

function slotKey(slot: Slot): string {
	if ("option" in slot) {
		return slot.option;
	}

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

		const picked = await pickFinal({
			client,
			throwOnError: true,
			auth: adminSecret,
			path: { id: event.id },
			// The overlap checked above, as the dated slots it is.
			body: { slots: slots.slice(2, 6) },
		});

		expect(picked.data.final).toMatchObject({ kind: "chosen", sequence: 1, slots: computed });

		const calendar = async () => {
			const file = await getFinalCalendar({ client, throwOnError: true, path: { id: event.id } });

			return file.data.replaceAll("\r\n ", "");
		};

		const first = await calendar();

		expect(first).toContain(`UID:${event.id}@convenr`);
		expect(first).toContain("SEQUENCE:1");

		// Moving the final time keeps the entry and raises its sequence.
		await pickFinal({
			client,
			throwOnError: true,
			auth: adminSecret,
			path: { id: event.id },
			body: { slots: slots.slice(2, 4) },
		});

		const moved = await calendar();

		expect(moved).toContain(`UID:${event.id}@convenr`);
		expect(moved).toContain("SEQUENCE:2");

		await deleteEvent({ client, throwOnError: true, auth: adminSecret, path: { id: event.id } });
	});

	it("creates a poll, answers its options and picks the best one", async () => {
		const day = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 7 });

		const at = (hour: number, days: number) =>
			day
				.add({ days })
				.toZonedDateTime({ timeZone: "Europe/Prague", plainTime: { hour } })
				.toInstant()
				.toString();

		const created = await createEvent({
			client,
			throwOnError: true,
			body: {
				name: "Dinner",
				referenceZone: "Europe/Prague",
				schedule: {
					mode: "poll",
					options: [
						{ start: at(18, 0), end: at(20, 0) },
						{ start: at(18, 1), end: at(20, 1) },
					],
				},
			},
		});

		const { event, adminSecret } = created.data;

		if (event.schedule.mode !== "poll") {
			throw new Error("The event was made as a poll.");
		}

		const [first, second] = event.schedule.slots;

		if (first === undefined || second === undefined) {
			throw new Error("The poll has two options.");
		}

		const ada = await join({
			client,
			throwOnError: true,
			path: { id: event.id },
			body: { name: "Ada" },
		});

		await saveAvailability({
			client,
			throwOnError: true,
			auth: ada.data.participantToken,
			path: { id: event.id },
			body: { availability: [first, second], ifNeedBe: [second] },
		});

		const windows = await getWindows({ client, throwOnError: true, path: { id: event.id } });

		expect(windows.data.windows.map((window) => window.slots)).toStrictEqual([[first], [second]]);

		const picked = await pickFinal({
			client,
			throwOnError: true,
			auth: adminSecret,
			path: { id: event.id },
			body: { slots: [first] },
		});

		expect(picked.data.final).toMatchObject({ kind: "chosen", start: at(18, 0), slots: [first] });

		await deleteEvent({ client, throwOnError: true, auth: adminSecret, path: { id: event.id } });
	});
});
