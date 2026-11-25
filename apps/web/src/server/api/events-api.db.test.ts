import { beforeEach, describe, expect, it } from "vitest";

import { GET as unknownPath, OPTIONS as unknownOptions } from "@/app/api/v1/[...path]/route";
import { DELETE as removeParticipant } from "@/app/api/v1/events/[id]/participants/[participantId]/route";
import { PUT as saveAvailability } from "@/app/api/v1/events/[id]/participants/me/availability/route";
import {
	DELETE as removeEvent,
	GET as readEvent,
	OPTIONS as eventPreflight,
	PATCH as updateEvent,
	POST as createOnEvent,
} from "@/app/api/v1/events/[id]/route";
import { GET as readWindows } from "@/app/api/v1/events/[id]/windows/route";
import { POST as createEvent } from "@/app/api/v1/events/route";
import { db } from "@/db/client";
import { events } from "@/db/schema";

import { resetTestDatabase } from "../test-events";
import {
	type AvailabilityRequest,
	createdEventSchema,
	eventSchema,
	type UpdateEventRequest,
	windowsSchema,
} from "./schemas";
import {
	bodyOf,
	call,
	createdEvent,
	FIRST_DAY,
	FIVE,
	joined,
	pragueEvenings,
	pragueSlot,
	refusalOf,
	SECOND_DAY,
	SIX,
} from "./test-client";

beforeEach(async () => {
	await resetTestDatabase();
});

describe("creating an event", () => {
	it("returns the event with its slots and an admin secret that no cache keeps", async () => {
		const response = await call(createEvent, {}, { method: "POST", body: pragueEvenings });

		expect(response.status).toBe(201);

		const { event, adminSecret } = await bodyOf(response, createdEventSchema);

		expect(response.headers.get("Location")).toBe(`/api/v1/events/${event.id}`);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect(adminSecret).toMatch(/^cva_[\w-]{43}$/u);
		expect(event).toEqual({
			id: event.id,
			name: "Schůzka výboru",
			description: "V klubovně.",
			referenceZone: "Europe/Prague",
			firstDayOfWeek: 1,
			schedule: {
				...pragueEvenings.schedule,
				slots: [FIVE, SIX, pragueSlot(SECOND_DAY, "17:00"), pragueSlot(SECOND_DAY, "18:00")],
			},
			retention: { kind: "until", date: SECOND_DAY.add({ days: 90 }).toString() },
			final: { kind: "open" },
			participants: [],
		});
	});

	it("points at a value of the wrong form", async () => {
		const response = await call(
			createEvent,
			{},
			{
				method: "POST",
				body: { ...pragueEvenings, schedule: { ...pragueEvenings.schedule, dailyEnd: "25:00" } },
			},
		);

		expect(await refusalOf(response)).toMatchObject({
			status: 400,
			code: "invalid_request",
			errors: [{ pointer: "/schedule/dailyEnd", code: "invalid_format" }],
		});
	});

	it("names a broken rule and points at each field that breaks it", async () => {
		const response = await call(
			createEvent,
			{},
			{
				method: "POST",
				body: {
					...pragueEvenings,
					schedule: {
						mode: "dates",
						dates: [FIRST_DAY.toString(), FIRST_DAY.toString(), "2020-01-01"],
						dailyStart: "17:00",
						dailyEnd: "19:00",
						slotMinutes: 60,
					},
				},
			},
		);

		expect(await refusalOf(response)).toEqual({
			type: "https://convenr.party/problems/duplicate_day",
			status: 422,
			title: "A day is chosen more than once.",
			code: "duplicate_day",
			errors: [
				{ pointer: "/schedule/dates/1", code: "duplicate_day" },
				{ pointer: "/schedule/dates/2", code: "date_in_past" },
			],
		});
	});

	it("points at a field the server checks, under its name in the request", async () => {
		const response = await call(
			createEvent,
			{},
			{
				method: "POST",
				body: { ...pragueEvenings, name: "x".repeat(101), referenceZone: "Mars/Olympus" },
			},
		);

		expect((await refusalOf(response)).errors).toEqual([
			{ pointer: "/name", code: "too_long" },
			{ pointer: "/referenceZone", code: "unknown_time_zone" },
		]);
	});

	it("refuses another media type, an oversized body and broken JSON", async () => {
		const form = await call(
			createEvent,
			{},
			{
				method: "POST",
				body: pragueEvenings,
				headers: { "Content-Type": "text/plain" },
			},
		);

		const oversized = await call(
			createEvent,
			{},
			{
				method: "POST",
				body: { ...pragueEvenings, description: "x".repeat(70_000) },
			},
		);

		const broken = await createEvent(
			new Request("http://localhost/api/v1/events", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{",
			}),
			{ params: Promise.resolve({}) },
		);

		expect((await refusalOf(form)).code).toBe("unsupported_media_type");
		expect((await refusalOf(oversized)).code).toBe("payload_too_large");
		expect(await refusalOf(broken)).toMatchObject({ status: 400, code: "invalid_request" });
		expect(await db().select().from(events)).toEqual([]);
	});
});

describe("reading an event", () => {
	it("sends the version as an entity tag and answers a matching If-None-Match with 304", async () => {
		const { id } = await createdEvent();
		const first = await call(readEvent, { id });
		const tag = first.headers.get("ETag") ?? "";

		expect(first.status).toBe(200);
		expect(first.headers.get("Cache-Control")).toBe("no-cache");
		expect(tag).toMatch(/^"[^"]+"$/u);
		await bodyOf(first, eventSchema);

		const unchanged = await call(readEvent, { id }, { headers: { "If-None-Match": tag } });

		expect(unchanged.status).toBe(304);
		expect(await unchanged.text()).toBe("");
		expect(unchanged.headers.get("ETag")).toBe(tag);

		await joined(id, "Jana");

		const changed = await call(readEvent, { id }, { headers: { "If-None-Match": tag } });

		expect(changed.status).toBe(200);
		expect(changed.headers.get("ETag")).not.toBe(tag);
	});

	it("answers an unknown event and an unknown path with not_found", async () => {
		expect(await refusalOf(await call(readEvent, { id: "abcdefghijkm" }))).toMatchObject({
			status: 404,
			code: "not_found",
		});
		expect(
			(await refusalOf(await call(unknownPath, { path: ["nothing"] }, { path: "/nothing" }))).code,
		).toBe("not_found");
	});

	it("refuses a secret in the query string on every endpoint, even without one needed", async () => {
		const { id, adminSecret } = await createdEvent();

		const answers = await Promise.all(
			[`/events/${id}?secret=x`, `/events/${id}?key=${adminSecret}`].map(async (path) => {
				const response = await call(readEvent, { id }, { path });
				const { status, code } = await refusalOf(response);

				return { status, code, cache: response.headers.get("Cache-Control") };
			}),
		);

		expect(answers).toMatchObject([
			{ status: 400, code: "secret_in_query", cache: "no-store" },
			{ status: 400, code: "secret_in_query", cache: "no-store" },
		]);

		const preflight = await call(eventPreflight, { id }, { method: "OPTIONS", path: "?token=x" });

		expect(preflight.status).toBe(400);
	});
});

describe("cross-origin use", () => {
	it("answers a preflight request with the route's methods and the allowed headers", async () => {
		const response = await call(
			eventPreflight,
			{ id: "abcdefghijkm" },
			{
				method: "OPTIONS",
				headers: { Origin: "https://example.org", "Access-Control-Request-Method": "PATCH" },
			},
		);

		expect(response.status).toBe(204);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			"access-control-allow-origin": "*",
			"access-control-allow-methods": "GET, PATCH, DELETE, HEAD, OPTIONS",
			"access-control-allow-headers": "Authorization, Content-Type, If-Match, If-None-Match",
		});
	});

	it("lets a script read the Location of a new event", async () => {
		const response = await call(createEvent, {}, { method: "POST", body: pragueEvenings });

		expect(response.headers.get("Access-Control-Expose-Headers")).toContain("Location");
	});
});

describe("unsupported methods and paths", () => {
	it("answers a method the route does not have with 405, after the query string check", async () => {
		const response = await call(createOnEvent, { id: "abcdefghijkm" }, { method: "POST" });

		expect(await refusalOf(response)).toMatchObject({ status: 405, code: "method_not_allowed" });
		expect(response.headers.get("Allow")).toBe("GET, PATCH, DELETE, HEAD, OPTIONS");
		expect(response.headers.get("Cache-Control")).toBe("no-store");

		const leaked = await call(createOnEvent, { id: "abcdefghijkm" }, { path: "?secret=x" });

		expect((await refusalOf(leaked)).code).toBe("secret_in_query");
	});

	it("answers an id that cannot exist with not_found, or with 401 behind the admin secret", async () => {
		const { adminSecret } = await createdEvent();

		expect((await refusalOf(await call(readEvent, { id: "../x" }))).code).toBe("not_found");
		expect(
			(await call(updateEvent, { id: "../x" }, { method: "PATCH", secret: adminSecret, body: {} }))
				.status,
		).toBe(401);
		expect(
			(
				await call(
					removeParticipant,
					{ id: "abcdefghijkm", participantId: "0" },
					{ method: "DELETE", secret: adminSecret },
				)
			).status,
		).toBe(401);
	});

	it("answers every method on an unknown path with not_found", async () => {
		const answers = await Promise.all(
			[unknownOptions, unknownPath].map(
				async (handler) =>
					(await refusalOf(await call(handler, { path: ["nothing"] }, { path: "/nothing" }))).code,
			),
		);

		expect(answers).toEqual(["not_found", "not_found"]);
	});
});

describe("admin secret", () => {
	it("gives the same 401 for a missing secret, a wrong one and an event that does not exist", async () => {
		const { id } = await createdEvent();
		const change = { method: "PATCH", body: { name: "Jiné" } };

		const answers = await Promise.all(
			[
				call(updateEvent, { id }, change),
				call(updateEvent, { id }, { ...change, secret: "cva_wrong" }),
				call(updateEvent, { id: "abcdefghijkm" }, { ...change, secret: "cva_wrong" }),
			].map(async (pending) => {
				const response = await pending;

				return {
					status: response.status,
					challenge: response.headers.get("WWW-Authenticate"),
					body: await response.text(),
				};
			}),
		);

		expect(answers[0]).toMatchObject({ status: 401, challenge: "Bearer" });
		expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
	});

	it("refuses a participant token with wrong_secret_kind", async () => {
		const { id } = await createdEvent();
		const { token } = await joined(id, "Jana");

		const response = await call(removeEvent, { id }, { method: "DELETE", secret: token });

		expect(await refusalOf(response)).toMatchObject({ status: 403, code: "wrong_secret_kind" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});
});

describe("changing an event", () => {
	it("changes only the fields sent and returns the event", async () => {
		const { id, adminSecret } = await createdEvent();

		const response = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: { name: "Zkouška", firstDayOfWeek: 7 },
			},
		);

		expect(await bodyOf(response, eventSchema)).toMatchObject({
			name: "Zkouška",
			description: "V klubovně.",
			firstDayOfWeek: 7,
			schedule: { mode: "range", dailyEnd: "19:00" },
		});
	});

	it("writes nothing for a change that changes nothing and returns the event as it is", async () => {
		const { id, adminSecret } = await createdEvent();
		const tag = (await call(readEvent, { id })).headers.get("ETag");

		const change = (body: UpdateEventRequest) =>
			call(updateEvent, { id }, { method: "PATCH", secret: adminSecret, body });

		const empty = await change({});
		const same = await change({ name: pragueEvenings.name, schedule: pragueEvenings.schedule });

		for (const response of [empty, same]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("ETag")).toBe(tag);
		}

		expect((await bodyOf(same, eventSchema)).name).toBe(pragueEvenings.name);
	});

	it("refuses a field the schema does not name instead of ignoring it", async () => {
		const { id, adminSecret } = await createdEvent();

		const response = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: { nmae: "Jiné", schedule: { ...pragueEvenings.schedule, slots: [] } },
			},
		);

		expect(await refusalOf(response)).toMatchObject({
			status: 400,
			code: "invalid_request",
			errors: [
				{ pointer: "/schedule/slots", code: "not_allowed" },
				{ pointer: "/nmae", code: "not_allowed" },
			],
		});
	});

	it("asks to confirm lost availability, then removes it", async () => {
		const { id, adminSecret } = await createdEvent();
		const { token } = await joined(id, "Jana");

		await call(
			saveAvailability,
			{ id },
			{
				method: "PUT",
				secret: token,
				body: { availability: [SIX] },
			},
		);

		const narrowed = {
			schedule: { ...pragueEvenings.schedule, dailyEnd: "18:00" },
		};

		const asked = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: narrowed,
			},
		);

		const version = asked.headers.get("ETag") ?? "";

		expect(await refusalOf(asked)).toMatchObject({
			status: 409,
			code: "confirmation_required",
			losing: 1,
		});
		expect(version).toBe((await call(readEvent, { id })).headers.get("ETag"));

		// A matching If-Match alone never accepts the loss; another confirmed version asks again.
		const unconfirmed = [
			{ body: narrowed, headers: { "If-Match": version } },
			{ body: { ...narrowed, confirmedVersion: '"99999"' }, headers: {} },
			{ body: { ...narrowed, confirmedVersion: "x" }, headers: { "If-Match": version } },
		];

		const refusals = await Promise.all(
			unconfirmed.map((request) =>
				call(updateEvent, { id }, { method: "PATCH", secret: adminSecret, ...request }),
			),
		);

		const problems = await Promise.all(refusals.map((refused) => refusalOf(refused)));

		expect(problems.map(({ status, code, losing }) => ({ status, code, losing }))).toEqual(
			unconfirmed.map(() => ({ status: 409, code: "confirmation_required", losing: 1 })),
		);
		expect(refusals.map((refused) => refused.headers.get("ETag"))).toEqual(
			unconfirmed.map(() => version),
		);

		const confirmed = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: { ...narrowed, confirmedVersion: version },
			},
		);

		const written = await bodyOf(confirmed, eventSchema);

		expect(written.participants[0]?.availability).toEqual([]);
		expect(confirmed.headers.get("ETag")).not.toBe(version);
		expect(confirmed.headers.get("ETag")).toBe((await call(readEvent, { id })).headers.get("ETag"));
	});

	it("does not accept the loss after the event changed since it was shown", async () => {
		const { id, adminSecret } = await createdEvent();
		const jana = await joined(id, "Jana");
		const petr = await joined(id, "Petr");

		const save = (token: string, slot: typeof FIVE) =>
			call(
				saveAvailability,
				{ id },
				{ method: "PUT", secret: token, body: { availability: [slot] } },
			);

		await save(jana.token, SIX);

		const narrowed = { schedule: { ...pragueEvenings.schedule, dailyEnd: "18:00" } };

		const patch = (confirmedVersion?: string) =>
			call(
				updateEvent,
				{ id },
				{
					method: "PATCH",
					secret: adminSecret,
					body: confirmedVersion === undefined ? narrowed : { ...narrowed, confirmedVersion },
				},
			);

		const asked = await patch();
		const version = asked.headers.get("ETag") ?? "";

		expect(await refusalOf(asked)).toMatchObject({ code: "confirmation_required", losing: 1 });

		// Another participant now loses availability instead: the count is still one.
		await save(jana.token, FIVE);
		await save(petr.token, SIX);

		const stale = await patch(version);

		expect(await refusalOf(stale)).toMatchObject({
			status: 409,
			code: "confirmation_required",
			losing: 1,
		});
		expect(stale.headers.get("ETag")).not.toBe(version);
	});

	it("refuses a change for a version the event no longer has, whatever the change is", async () => {
		const { id, adminSecret } = await createdEvent();
		const version = (await call(readEvent, { id })).headers.get("ETag") ?? "";

		await joined(id, "Jana");

		const patch = (ifMatch: string) =>
			call(
				updateEvent,
				{ id },
				{
					method: "PATCH",
					secret: adminSecret,
					body: { name: "Jiné" },
					headers: { "If-Match": ifMatch },
				},
			);

		expect(await refusalOf(await patch(version))).toMatchObject({
			status: 412,
			code: "event_changed",
		});
		expect((await bodyOf(await call(readEvent, { id }), eventSchema)).name).toBe(
			pragueEvenings.name,
		);

		const current = (await call(readEvent, { id })).headers.get("ETag") ?? "";

		expect((await patch(current)).status).toBe(200);
		expect((await patch("*")).status).toBe(200);

		const after = (await call(readEvent, { id })).headers.get("ETag") ?? "";

		expect((await patch(`"other", ${after}`)).status).toBe(200);
	});

	it("answers a change with the event as written, with the version it gave it", async () => {
		const { id, adminSecret } = await createdEvent();

		const response = await call(
			updateEvent,
			{ id },
			{ method: "PATCH", secret: adminSecret, body: { name: "Zkouška" } },
		);

		const read = await call(readEvent, { id });

		expect(response.headers.get("ETag")).toBe(read.headers.get("ETag"));
		expect(await bodyOf(response, eventSchema)).toEqual(await bodyOf(read, eventSchema));
	});

	it("refuses a locked field once someone joined", async () => {
		const { id, adminSecret } = await createdEvent();

		await joined(id, "Jana");

		const response = await call(
			updateEvent,
			{ id },
			{
				method: "PATCH",
				secret: adminSecret,
				body: { referenceZone: "Europe/London" },
			},
		);

		expect(await refusalOf(response)).toMatchObject({
			status: 409,
			code: "field_locked",
			errors: [{ pointer: "/referenceZone", code: "field_locked" }],
		});
	});
});

describe("deleting", () => {
	it("deletes a participant by public id, and tells an unknown one apart", async () => {
		const { id, adminSecret } = await createdEvent();
		const { participantId } = await joined(id, "Jana");

		const remove = (who: string) =>
			call(
				removeParticipant,
				{ id, participantId: who },
				{ method: "DELETE", secret: adminSecret },
			);

		expect((await remove(participantId)).status).toBe(204);
		expect(await refusalOf(await remove(participantId))).toMatchObject({
			status: 404,
			code: "not_found",
		});
	});

	it("deletes the event for good", async () => {
		const { id, adminSecret } = await createdEvent();

		expect(
			(await call(removeEvent, { id }, { method: "DELETE", secret: adminSecret })).status,
		).toBe(204);
		expect((await call(readEvent, { id })).status).toBe(404);
	});
});

describe("best windows", () => {
	it("lists the windows with the most people, filtered by the query", async () => {
		const { id } = await createdEvent();
		const jana = await joined(id, "Jana");
		const petr = await joined(id, "Petr");

		await call(
			saveAvailability,
			{ id },
			{
				method: "PUT",
				secret: jana.token,
				body: { availability: [FIVE, SIX] },
			},
		);
		await call(
			saveAvailability,
			{ id },
			{
				method: "PUT",
				secret: petr.token,
				body: { availability: [SIX] },
			},
		);

		const best = await bodyOf(await call(readWindows, { id }), windowsSchema);

		expect(best).toEqual({
			minMinutes: 60,
			minPeople: 2,
			windows: [
				{
					slots: [SIX],
					minutes: 60,
					participantIds: [jana.participantId, petr.participantId],
					ifNeedBe: 0,
					score: 2,
				},
			],
		});

		const longer = await call(readWindows, { id }, { path: "?minPeople=1&minMinutes=120" });

		expect((await bodyOf(longer, windowsSchema)).windows).toEqual([
			{
				slots: [FIVE, SIX],
				minutes: 120,
				participantIds: [jana.participantId],
				ifNeedBe: 0,
				score: 1,
			},
		]);
	});

	it("counts people at if need be in a window, which grows over their slots", async () => {
		const { id } = await createdEvent();
		const jana = await joined(id, "Jana");
		const petr = await joined(id, "Petr");

		const save = (token: string, body: AvailabilityRequest) =>
			call(saveAvailability, { id }, { method: "PUT", secret: token, body });

		await save(jana.token, { availability: [FIVE, SIX], ifNeedBe: [FIVE] });
		await save(petr.token, { availability: [FIVE, SIX] });

		const best = await bodyOf(await call(readWindows, { id }), windowsSchema);

		expect(best.windows).toEqual([
			{
				slots: [FIVE, SIX],
				minutes: 120,
				participantIds: [jana.participantId, petr.participantId],
				ifNeedBe: 1,
				score: 1.5,
			},
		]);
	});

	it("names a query parameter that does not fit", async () => {
		const { id } = await createdEvent();

		const response = await call(readWindows, { id }, { path: "?minPeople=0" });

		expect(await refusalOf(response)).toMatchObject({
			status: 400,
			code: "invalid_request",
			errors: [{ parameter: "minPeople", code: "too_small" }],
		});
	});

	it("takes whole numbers in decimal digits only, up to the limits of an event", async () => {
		const { id } = await createdEvent();

		const refusals = async (query: string) =>
			(await refusalOf(await call(readWindows, { id }, { path: `?${query}` }))).errors;

		expect(await refusals("minMinutes=0x10")).toEqual([
			{ parameter: "minMinutes", code: "invalid_format" },
		]);
		expect(await refusals("minPeople=1e2")).toEqual([
			{ parameter: "minPeople", code: "invalid_format" },
		]);
		expect(await refusals("minPeople=%2B5")).toEqual([
			{ parameter: "minPeople", code: "invalid_format" },
		]);
		expect(await refusals("minPeople=")).toEqual([
			{ parameter: "minPeople", code: "invalid_format" },
		]);
		expect(await refusals("minPeople=101")).toEqual([
			{ parameter: "minPeople", code: "too_large" },
		]);
		expect(await refusals("minMinutes=1441")).toEqual([
			{ parameter: "minMinutes", code: "too_large" },
		]);
		expect(
			(await call(readWindows, { id }, { path: "?minPeople=100&minMinutes=0060" })).status,
		).toBe(200);
	});

	it("sends the version as an entity tag and answers a matching If-None-Match with 304", async () => {
		const { id } = await createdEvent();
		const first = await call(readWindows, { id });
		const tag = first.headers.get("ETag") ?? "";

		expect(first.status).toBe(200);
		expect(tag).toBe((await call(readEvent, { id })).headers.get("ETag"));

		const unchanged = await call(readWindows, { id }, { headers: { "If-None-Match": tag } });

		expect(unchanged.status).toBe(304);
		expect(await unchanged.text()).toBe("");
		expect(unchanged.headers.get("ETag")).toBe(tag);

		// The query is checked before the tag, so a bad parameter is never answered with 304.
		const invalid = await call(
			readWindows,
			{ id },
			{ path: "?minPeople=0", headers: { "If-None-Match": tag } },
		);

		expect(invalid.status).toBe(400);

		await joined(id, "Jana");

		const changed = await call(readWindows, { id }, { headers: { "If-None-Match": tag } });

		expect(changed.status).toBe(200);
		expect(changed.headers.get("ETag")).not.toBe(tag);
	});
});
