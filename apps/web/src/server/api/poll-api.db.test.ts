import { beforeEach, describe, expect, it } from "vitest";

import { GET as readCalendar } from "@/app/api/v1/events/[id]/final.ics/route";
import { PUT as pickFinal } from "@/app/api/v1/events/[id]/final/route";
import { PUT as saveAvailability } from "@/app/api/v1/events/[id]/participants/me/availability/route";
import { GET as readEvent, PATCH as updateEvent } from "@/app/api/v1/events/[id]/route";
import { GET as readWindows } from "@/app/api/v1/events/[id]/windows/route";
import { POST as createEvent } from "@/app/api/v1/events/route";
import { db } from "@/db/client";
import { events } from "@/db/schema";

import {
	type AvailabilityRequest,
	type CreateEventRequest,
	eventSchema,
	type UpdateEventRequest,
	windowsSchema,
} from "./schemas";
import { bodyOf, call, createdEvent, joined, pragueEvenings, refusalOf } from "./test-client";

beforeEach(async () => {
	await db().delete(events);
});

/** Three evenings in April 2027, 18:00 to 20:00 in Prague, sent out of time order. */
const evenings = {
	name: "Výběr večera",
	referenceZone: "Europe/Prague",
	schedule: {
		mode: "poll",
		options: [
			{ start: "2027-04-07T16:00:00Z", end: "2027-04-07T18:00:00Z" },
			{ start: "2027-04-05T16:00:00Z", end: "2027-04-05T18:00:00Z" },
			{ start: "2027-04-09T16:00:00Z", end: "2027-04-09T18:00:00Z" },
		],
	},
} satisfies CreateEventRequest;

async function createdPoll() {
	const created = await createdEvent(evenings);

	if (created.event.schedule.mode !== "poll") {
		throw new Error("The event is not a poll.");
	}

	return { ...created, options: created.event.schedule.options };
}

async function refusedPoll(options: unknown[]) {
	const response = await call(
		createEvent,
		{},
		{ method: "POST", path: "/events", body: { ...evenings, schedule: { mode: "poll", options } } },
	);

	expect(response.status).toBe(422);

	return refusalOf(response);
}

function save(id: string, token: string, body: AvailabilityRequest) {
	return call(saveAvailability, { id }, { method: "PUT", secret: token, body });
}

function patch(id: string, secret: string, body: UpdateEventRequest) {
	return call(updateEvent, { id }, { method: "PATCH", secret, body });
}

describe("a poll", () => {
	it("is created with its options in time order, one slot each, and no first day of the week", async () => {
		const { event, options } = await createdPoll();

		expect(options.map((option) => option.start)).toEqual([
			"2027-04-05T16:00:00Z",
			"2027-04-07T16:00:00Z",
			"2027-04-09T16:00:00Z",
		]);
		expect(event.schedule.slots).toEqual(options.map((option) => ({ option: option.id })));
		expect(event).not.toHaveProperty("firstDayOfWeek");
		expect(event.retention).toEqual({ kind: "until", date: "2027-07-08" });
	});

	it("refuses options that break the limits, at the option at fault", async () => {
		const one = { start: "2027-04-05T16:00:00Z", end: "2027-04-05T18:00:00Z" };

		expect(await refusedPoll([one])).toMatchObject({
			code: "too_few_options",
			errors: [{ pointer: "/schedule/options", code: "too_few_options" }],
		});
		expect(await refusedPoll([one, one])).toMatchObject({
			code: "duplicate_option",
			errors: [{ pointer: "/schedule/options/1", code: "duplicate_option" }],
		});
		expect(
			await refusedPoll([one, { start: "2027-04-06T16:00:00Z", end: "2027-04-06T16:00:00Z" }]),
		).toMatchObject({ errors: [{ pointer: "/schedule/options/1/end" }] });
		expect(
			await refusedPoll([one, { start: "2027-04-06T20:00:00Z", end: "2027-04-06T23:00:00Z" }]),
		).toMatchObject({
			code: "option_not_one_day",
			errors: [{ pointer: "/schedule/options/1/end", code: "option_not_one_day" }],
		});
		expect(
			await refusedPoll([one, { start: "2020-04-06T16:00:00Z", end: "2020-04-06T18:00:00Z" }]),
		).toMatchObject({
			code: "date_in_past",
			errors: [{ pointer: "/schedule/options/1/start", code: "date_in_past" }],
		});
		expect(await refusedPoll([one, { id: "abcdefghijkm" }])).toMatchObject({
			code: "unknown_option",
			errors: [{ pointer: "/schedule/options/1/id", code: "unknown_option" }],
		});
	});

	it("takes answers by option and lists the best options by score", async () => {
		const { id, options } = await createdPoll();
		const [monday, wednesday] = options.map((option) => ({ option: option.id }));

		if (monday === undefined || wednesday === undefined) {
			throw new Error("The poll has fewer than two options.");
		}

		const jana = await joined(id, "Jana");
		const petr = await joined(id, "Petr");

		expect((await save(id, jana.token, { availability: [monday, wednesday] })).status).toBe(200);
		expect(
			(await save(id, petr.token, { availability: [monday, wednesday], ifNeedBe: [wednesday] }))
				.status,
		).toBe(200);

		const unknown = await save(id, jana.token, { availability: [{ option: "abcdefghijkm" }] });

		expect((await refusalOf(unknown)).code).toBe("unknown_slot");

		const read = await bodyOf(await call(readEvent, { id }), eventSchema);

		expect(read.participants.map((person) => person.ifNeedBe)).toEqual([[], [wednesday]]);

		const best = await bodyOf(await call(readWindows, { id }), windowsSchema);

		expect(best.windows).toEqual([
			{
				slots: [monday],
				minutes: 120,
				participantIds: [jana.participantId, petr.participantId],
				ifNeedBe: 0,
				score: 2,
			},
			{
				slots: [wednesday],
				minutes: 120,
				participantIds: [jana.participantId, petr.participantId],
				ifNeedBe: 1,
				score: 1.5,
			},
		]);
	});

	it("keeps options by id, adds new ones and confirms removing an answered one", async () => {
		const { id, adminSecret, options } = await createdPoll();
		const [monday, wednesday, friday] = options;

		if (monday === undefined || wednesday === undefined || friday === undefined) {
			throw new Error("The poll has fewer than three options.");
		}

		const jana = await joined(id, "Jana");

		await save(id, jana.token, { availability: [{ option: friday.id }] });

		const added = { start: "2027-04-10T08:00:00Z", end: "2027-04-10T10:00:00Z" };

		const change = {
			schedule: { mode: "poll", options: [{ id: monday.id }, { id: wednesday.id }, added] },
		} satisfies UpdateEventRequest;

		const refused = await patch(id, adminSecret, change);

		expect(await refusalOf(refused)).toMatchObject({
			code: "confirmation_required",
			losing: 1,
			clearsFinal: false,
		});

		const confirmed = await patch(id, adminSecret, {
			...change,
			confirmedVersion: refused.headers.get("ETag") ?? "",
		});

		const after = await bodyOf(confirmed, eventSchema);

		if (after.schedule.mode !== "poll") {
			throw new Error("The event stopped being a poll.");
		}

		expect(after.schedule.options.slice(0, 2)).toEqual([monday, wednesday]);
		expect(after.schedule.options[2]).toMatchObject(added);
		expect(after.participants[0]?.availability).toEqual([]);
	});

	it("becomes a grid only while nobody has joined", async () => {
		const { id, adminSecret } = await createdPoll();
		const grid = { schedule: pragueEvenings.schedule };

		await joined(id, "Jana");

		expect(await refusalOf(await patch(id, adminSecret, grid))).toMatchObject({
			code: "field_locked",
			errors: [{ pointer: "/schedule/mode", code: "field_locked" }],
		});

		const empty = await createdPoll();
		const changed = await bodyOf(await patch(empty.id, empty.adminSecret, grid), eventSchema);

		expect(changed.schedule.mode).toBe("range");
		expect(changed.firstDayOfWeek).toBe(1);
	});

	it("picks one option as the final time and clears it when the option is removed", async () => {
		const { id, adminSecret, options } = await createdPoll();
		const [monday, wednesday, friday] = options;

		if (monday === undefined || wednesday === undefined || friday === undefined) {
			throw new Error("The poll has fewer than three options.");
		}

		const picked = await call(
			pickFinal,
			{ id },
			{ method: "PUT", secret: adminSecret, body: { slots: [{ option: wednesday.id }] } },
		);

		expect((await bodyOf(picked, eventSchema)).final).toEqual({
			kind: "chosen",
			start: wednesday.start,
			end: wednesday.end,
			sequence: 1,
			slots: [{ option: wednesday.id }],
		});

		const two = await call(
			pickFinal,
			{ id },
			{
				method: "PUT",
				secret: adminSecret,
				body: { slots: [{ option: monday.id }, { option: friday.id }] },
			},
		);

		expect((await refusalOf(two)).code).toBe("final_not_in_event");

		const calendar = await (await call(readCalendar, { id })).text();

		expect(calendar).toContain("DTSTART:20270407T160000Z");

		const change = {
			schedule: { mode: "poll", options: [{ id: monday.id }, { id: friday.id }] },
		} satisfies UpdateEventRequest;

		const refused = await patch(id, adminSecret, change);

		expect(await refusalOf(refused)).toMatchObject({ losing: 0, clearsFinal: true });

		const cleared = await patch(id, adminSecret, {
			...change,
			confirmedVersion: refused.headers.get("ETag") ?? "",
		});

		expect((await bodyOf(cleared, eventSchema)).final).toEqual({ kind: "open" });
	});
});
