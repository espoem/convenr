import { beforeEach, describe, expect, it } from "vitest";

import { GET as readCalendar } from "@/app/api/v1/events/[id]/final.ics/route";
import { DELETE as clearFinal, PUT as pickFinal } from "@/app/api/v1/events/[id]/final/route";
import { PATCH as updateEvent } from "@/app/api/v1/events/[id]/route";
import { toWeekday } from "@/domain/schedule";

import { resetTestDatabase } from "../test-events";
import { eventSchema, type FinalRequestBody } from "./schemas";
import {
	bodyOf,
	call,
	createdEvent,
	FIRST_DAY,
	FIVE,
	icalUtc,
	pragueEvenings,
	pragueSlot,
	refusalOf,
	SECOND_DAY,
	SEVEN,
	SIX,
} from "./test-client";

beforeEach(async () => {
	await resetTestDatabase();
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
				start: FIVE.start,
				end: SEVEN.start,
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
			slots: [FIVE, pragueSlot(SECOND_DAY, "17:00")],
		});

		expect(response.status).toBe(422);
		expect(await refusalOf(response)).toMatchObject({
			code: "final_not_in_event",
			errors: [{ pointer: "/slots", code: "final_not_in_event" }],
		});
	});

	it("needs a weekday event's date on the weekday of its slots and serves its calendar file", async () => {
		const date = FIRST_DAY;
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

		const calendar = await call(readCalendar, { id });
		const body = await calendar.text();

		expect(calendar.status).toBe(200);
		expect(body).toContain(`DTSTART:${icalUtc(FIVE.start)}`);
		expect(body).toContain(`DTEND:${icalUtc(SIX.start)}`);
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

	it("is downloaded as a calendar file with 304 caching and 404 before finalization", async () => {
		const { id, adminSecret } = await createdEvent();

		const missing = await call(readCalendar, { id }, { headers: { "If-None-Match": '"v1"' } });

		expect(missing.status).toBe(404);
		expect(await refusalOf(missing)).toMatchObject({ code: "not_finalized" });

		await pick(id, adminSecret, { slots: [FIVE, SIX] });

		const first = await call(readCalendar, { id });
		const etag = first.headers.get("ETag") ?? "";
		const lines = (await first.text()).replaceAll("\r\n ", "").split("\r\n");

		expect(first.status).toBe(200);
		expect(etag).not.toBe("");
		expect(first.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
		expect(first.headers.get("Content-Disposition")).toMatch(
			/^attachment; filename="schuzka-vyboru-\w+\.ics"$/u,
		);
		expect(lines).toEqual(
			expect.arrayContaining([
				`UID:${id}@convenr`,
				"SEQUENCE:1",
				`DTSTART:${icalUtc(FIVE.start)}`,
				`DTEND:${icalUtc(SEVEN.start)}`,
				"SUMMARY:Schůzka výboru",
				expect.stringMatching(/^DESCRIPTION:V klubovně\.\\n\\nhttp:\/\/[^/]+\/e\/schuzka-vyboru-/u),
			]),
		);
		expect(lines.join("\n")).not.toContain("cva_");

		const cached = await call(readCalendar, { id }, { headers: { "If-None-Match": etag } });

		expect(cached.status).toBe(304);

		await pick(id, adminSecret, { slots: [SIX] });

		const stale = await call(readCalendar, { id }, { headers: { "If-None-Match": etag } });
		const later = await stale.text();

		expect(stale.status).toBe(200);
		expect(later).toContain(`UID:${id}@convenr`);
		expect(later).toContain("SEQUENCE:2");
		expect(later).toContain(`DTSTART:${icalUtc(SIX.start)}`);
	});

	it("refuses the participant token and a wrong admin secret", async () => {
		const { id } = await createdEvent();

		expect((await pick(id, "cva_wrong", { slots: [FIVE] })).status).toBe(401);
	});
});
