import { describe, expect, it } from "vitest";

import { type Client, createClient, getEvent } from "./index.js";

const eventId = "abcdefghijkm";

/** A client whose every request gets the given JSON text. */
function serving(status: number, json: string, contentType: string): Client {
	return createClient({
		baseUrl: "https://convenr.test/api/v1",
		fetch: () =>
			Promise.resolve(new Response(json, { status, headers: { "Content-Type": contentType } })),
	});
}

describe("a client written for this version", () => {
	it("keeps the fields a later version adds to a response", async () => {
		const event = { id: eventId, name: "Retro", addedLater: { nested: true } };
		const client = serving(200, JSON.stringify(event), "application/json");

		const { data } = await getEvent({ client, path: { id: eventId } });

		expect(data).toStrictEqual(event);
	});

	it("keeps a problem code it does not know", async () => {
		const problem = {
			type: "https://convenr.party/problems/added_later",
			status: 404,
			title: "Added later",
			code: "added_later",
		};

		const client = serving(404, JSON.stringify(problem), "application/problem+json");

		const { error, response } = await getEvent({ client, path: { id: eventId } });

		expect(response?.status).toBe(404);
		expect(error).toStrictEqual(problem);
	});

	it("keeps an enum value it does not know", async () => {
		const event = {
			id: eventId,
			name: "Retro",
			participants: [
				{
					id: "abcdefghijkm",
					name: "Jana",
					availability: [{ start: "2027-04-05T15:00:00Z", level: "preferred" }],
				},
			],
		};

		const client = serving(200, JSON.stringify(event), "application/json");
		const { data } = await getEvent({ client, path: { id: eventId } });

		expect(data).toStrictEqual(event);
	});
});
