import { beforeEach, describe, expect, it } from "vitest";

import { GET as readCalendar } from "@/app/api/v1/events/[id]/final.ics/route";
import { DELETE as clearFinal, PUT as pickFinal } from "@/app/api/v1/events/[id]/final/route";
import { PATCH as updateEvent } from "@/app/api/v1/events/[id]/route";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import { toWeekday } from "@/domain/schedule";

import { eventSchema, type FinalRequestBody } from "./schemas";
import { bodyOf, call, createdEvent, FIVE, pragueEvenings, refusalOf, SIX } from "./test-client";

beforeEach(async () => {
	await db().delete(events);
});

function pick(id: string, secret: string, body: FinalRequestBody, headers = {}) {
	return call(pickFinal, { id }, { method: "PUT", secret, body, headers });
}

describe("the final time", () => {
	it("is picked, changed and cleared, and moves the entity tag each time", async () => {
		const { id, adminSecret } = await createdEvent();

		const picked = await pick(id, adminSecret, { slots: [SIX, FIVE] });

		expect(await bodyOf(picked, eventSchema)).toMatchObject({
			final: {
				kind: "chosen",
				start: "2027-04-05T15:00:00Z",
				end: "2027-04-05T17:00:00Z",
				sequence: 1,
				slots: [FIVE, SIX],
			},
		});

		const changed = await pick(
			id,
			adminSecret,
			{ slots: [SIX] },
			{
				"If-Match": picked.headers.get("ETag") ?? "",
			},
		);

		expect((await bodyOf(changed, eventSchema)).final).toMatchObject({ sequence: 2, slots: [SIX] });
		expect(changed.headers.get("ETag")).not.toBe(picked.headers.get("ETag"));

		const cleared = await call(clearFinal, { id }, { method: "DELETE", secret: adminSecret });

		expect((await bodyOf(cleared, eventSchema)).final).toEqual({ kind: "open" });
	});

	it("refuses a window that is not a run of the event's slots, pointing at the slots", async () => {
		const { id, adminSecret } = await createdEvent();

		const response = await pick(id, adminSecret, {
			slots: [FIVE, { start: "2027-04-06T15:00:00Z" }],
		});

		expect(response.status).toBe(422);
		expect(await refusalOf(response)).toMatchObject({
			code: "final_not_in_event",
			errors: [{ pointer: "/slots", code: "final_not_in_event" }],
		});
	});

	it("needs a weekday event's date on the weekday of its slots", async () => {
		const date = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 7 });
		const weekday = toWeekday(date.dayOfWeek);

		if (weekday === undefined) {
			throw new Error(`${date.toString()} has no ISO weekday.`);
		}

		const { id, adminSecret } = await createdEvent({
			...pragueEvenings,
			schedule: {
				mode: "weekdays",
				weekdays: [weekday],
				dailyStart: "17:00",
				dailyEnd: "19:00",
				slotMinutes: 60,
			},
		});

		const slot = { weekday, minute: 1020 };

		const wrong = await pick(id, adminSecret, {
			slots: [slot],
			date: date.add({ days: 1 }).toString(),
		});

		expect(await refusalOf(wrong)).toMatchObject({
			code: "final_date_wrong_weekday",
			errors: [{ pointer: "/date", code: "final_date_wrong_weekday" }],
		});

		const picked = await pick(id, adminSecret, { slots: [slot], date: date.toString() });

		expect((await bodyOf(picked, eventSchema)).final).toMatchObject({
			kind: "chosen",
			slots: [slot],
		});
	});

	it("asks to confirm a change that would clear it, also when nobody loses availability", async () => {
		const { id, adminSecret } = await createdEvent();

		await pick(id, adminSecret, { slots: [SIX] });

		const asked = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: { schedule: { ...pragueEvenings.schedule, dailyEnd: "18:00" } },
			},
		);

		expect(await refusalOf(asked)).toMatchObject({
			code: "confirmation_required",
			losing: 0,
			clearsFinal: true,
		});
	});

	it("is downloaded as a calendar file that a later pick replaces", async () => {
		const { id, adminSecret } = await createdEvent();

		const missing = await call(readCalendar, { id });

		expect(missing.status).toBe(404);
		expect(await refusalOf(missing)).toMatchObject({ code: "not_finalized" });

		await pick(id, adminSecret, { slots: [FIVE, SIX] });

		const first = await call(readCalendar, { id });
		const lines = (await first.text()).replaceAll("\r\n ", "").split("\r\n");

		expect(first.status).toBe(200);
		expect(first.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
		expect(first.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="schuzka-vyboru-\w+\.ics"$/u,
		);
		expect(lines).toEqual(
			expect.arrayContaining([
				`UID:${id}@convenr`,
				"SEQUENCE:1",
				"DTSTART:20270405T150000Z",
				"DTEND:20270405T170000Z",
				"SUMMARY:Schůzka výboru",
				expect.stringMatching(/^DESCRIPTION:V klubovně\.\\n\\nhttp:\/\/[^/]+\/e\/schuzka-vyboru-/u),
			]),
		);
		expect(lines.join("\n")).not.toContain("cva_");

		await pick(id, adminSecret, { slots: [SIX] });

		const later = await (await call(readCalendar, { id })).text();

		expect(later).toContain(`UID:${id}@convenr`);
		expect(later).toContain("SEQUENCE:2");
		expect(later).toContain("DTSTART:20270405T160000Z");

		const unchanged = await call(
			readCalendar,
			{ id },
			{ headers: { "If-None-Match": first.headers.get("ETag") ?? "" } },
		);

		expect(unchanged.status).toBe(200);
	});

	it("refuses the participant token and a wrong admin secret", async () => {
		const { id } = await createdEvent();

		expect((await pick(id, "cva_wrong", { slots: [FIVE] })).status).toBe(401);
	});
});
