import { expect, test } from "@playwright/test";

import { createdEventSchema, joinedSchema } from "../src/server/api/schemas";

// The API through the running server: no locale redirect, the cross-origin headers, the
// participant routes next to the organizer's, and an unknown path as a problem.
test.describe("public API", () => {
	test("creates, joins and reads an event, and answers a repeated read with 304", async ({
		request,
	}) => {
		const created = await request.post("/api/v1/events", {
			data: {
				name: "API",
				referenceZone: "Europe/Prague",
				schedule: {
					mode: "weekdays",
					weekdays: [1],
					dailyStart: "17:00",
					dailyEnd: "18:00",
					slotMinutes: 60,
				},
			},
		});

		expect(created.status()).toBe(201);
		expect(created.headers()["access-control-allow-origin"]).toBe("*");

		const { event, adminSecret } = createdEventSchema.parse(await created.json());

		const joined = await request.post(`/api/v1/events/${event.id}/participants`, {
			data: { name: "Jana" },
		});

		const { participantToken } = joinedSchema.parse(await joined.json());

		const me = await request.get(`/api/v1/events/${event.id}/participants/me`, {
			headers: { Authorization: `Bearer ${participantToken}` },
		});

		expect(me.status()).toBe(200);

		const wrongKind = await request.get(`/api/v1/events/${event.id}/participants/me`, {
			headers: { Authorization: `Bearer ${adminSecret}` },
		});

		expect(wrongKind.status()).toBe(403);

		const read = await request.get(`/api/v1/events/${event.id}`);
		const tag = read.headers()["etag"] ?? "";

		expect(read.status()).toBe(200);
		expect(
			(
				await request.get(`/api/v1/events/${event.id}`, { headers: { "If-None-Match": tag } })
			).status(),
		).toBe(304);
	});

	test("answers a preflight request and an unknown path", async ({ request }) => {
		const preflight = await request.fetch("/api/v1/events/abcdefghijkm", {
			method: "OPTIONS",
			headers: { Origin: "https://example.org", "Access-Control-Request-Method": "PATCH" },
		});

		expect(preflight.status()).toBe(204);
		expect(preflight.headers()["access-control-allow-headers"]).toContain("Authorization");

		const unknown = await request.get("/api/v1/nothing");

		expect(unknown.status()).toBe(404);
		expect(unknown.headers()["content-type"]).toBe("application/problem+json");

		const unknownPreflight = await request.fetch("/api/v1/nothing", { method: "OPTIONS" });

		expect(unknownPreflight.status()).toBe(404);
		expect(unknownPreflight.headers()["content-type"]).toBe("application/problem+json");
	});

	test("answers a method a route does not have with 405, and HEAD where GET exists", async ({
		request,
	}) => {
		const put = await request.put("/api/v1/events", { data: {} });

		expect(put.status()).toBe(405);
		expect(put.headers()).toMatchObject({
			allow: "POST, OPTIONS",
			"content-type": "application/problem+json",
			"cache-control": "no-store",
			"access-control-allow-origin": "*",
		});
		expect(await put.json()).toMatchObject({
			type: "https://convenr.party/problems/method_not_allowed",
			code: "method_not_allowed",
		});

		expect((await request.head("/api/v1/events")).status()).toBe(405);
		expect((await request.delete("/api/v1/events/abcdefghijkm/windows")).status()).toBe(405);
		expect((await request.head("/api/v1/events/abcdefghijkm")).status()).toBe(404);

		const leaked = await request.put("/api/v1/events?token=x", { data: {} });

		expect(leaked.status()).toBe(400);
	});
});
