import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
	BODY_LIMIT_BYTES,
	bearerSecret,
	endpoint,
	hasSecretInQuery,
	jsonPointer,
	matchesIfNoneMatch,
	type PathParams,
	readJson,
	routeMethods,
	securedEndpoint,
	staticEndpoint,
} from "./http";
import { clockMinutes, clockTime } from "./mapping";
import { problemSchema } from "./schemas";

const schema = z.object({ items: z.array(z.int()) });

function post(body: string, headers: Record<string, string> = {}): Request {
	return new Request("http://localhost/api/v1/x", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body,
	});
}

function withHeader(name: string, value: string): Request {
	return new Request("http://localhost/api/v1/x", { headers: { [name]: value } });
}

function hasSecret(query: string): boolean {
	return hasSecretInQuery(new URL(`http://localhost/api/v1/x?${query}`));
}

async function problemOf(response: Response) {
	return problemSchema.parse(await response.json());
}

/** The problem `readJson` answers `request` with, or `undefined` when it reads the body. */
async function refusal(request: Request) {
	const read = await readJson(request, schema);

	return read.ok ? undefined : problemOf(read.response);
}

describe("JSON bodies", () => {
	it("reads JSON in UTF-8, also with a charset parameter", async () => {
		expect(await readJson(post('{"items":[1]}'), schema)).toEqual({
			ok: true,
			value: { items: [1] },
		});
		expect(
			await readJson(
				post('{"items":[]}', { "Content-Type": "application/json; charset=UTF-8" }),
				schema,
			),
		).toMatchObject({ ok: true });
	});

	it("refuses another media type or charset before reading the body", async () => {
		expect(
			await refusal(post("items=1", { "Content-Type": "application/x-www-form-urlencoded" })),
		).toMatchObject({ status: 415, code: "unsupported_media_type" });
		expect(
			await refusal(post("{}", { "Content-Type": "application/json; charset=latin1" })),
		).toMatchObject({ status: 415 });
	});

	it("refuses a body over 64 KB by its declared length or by what arrives", async () => {
		const large = `{"items":[${"1,".repeat(BODY_LIMIT_BYTES / 2)}1]}`;
		const tooLarge = { status: 413, code: "payload_too_large" };

		expect(
			await refusal(post("{}", { "Content-Length": String(BODY_LIMIT_BYTES + 1) })),
		).toMatchObject(tooLarge);
		expect(await refusal(post(large))).toMatchObject(tooLarge);
	});

	it("refuses broken JSON, and points at each field that does not match", async () => {
		expect(await refusal(post('{"items":'))).toMatchObject({
			status: 400,
			code: "invalid_request",
		});
		expect(await refusal(post('{"items":[1,"2"]}'))).toEqual({
			type: "https://convenr.party/problems/invalid_request",
			status: 400,
			title: "The request does not match the schema.",
			code: "invalid_request",
			errors: [{ pointer: "/items/1", code: "wrong_type" }],
		});
	});

	it("refuses a field the schema does not name, pointing at it", async () => {
		const strict = z.strictObject({ items: z.array(z.int()) });
		const read = await readJson(post('{"items":[],"itme":1}'), strict);

		expect(read.ok ? undefined : await problemOf(read.response)).toMatchObject({
			code: "invalid_request",
			errors: [{ pointer: "/itme", code: "not_allowed" }],
		});
	});

	it("counts a body that arrives in many chunks and stops reading past 64 KB", async () => {
		const chunk = new TextEncoder().encode(" ".repeat(1024));
		let sent = 0;

		const streamed = (chunks: number) => {
			// Node needs `duplex` for a streamed body; the DOM type of RequestInit does not list it.
			const init = {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				duplex: "half",
				body: new ReadableStream<Uint8Array>({
					pull(controller) {
						if (sent === chunks) {
							controller.enqueue(new TextEncoder().encode('{"items":[1]}'));
							controller.close();
						} else {
							sent += 1;
							controller.enqueue(chunk);
						}
					},
				}),
			};

			return new Request("http://localhost/api/v1/x", init);
		};

		expect(await readJson(streamed(60), schema)).toEqual({ ok: true, value: { items: [1] } });

		sent = 0;

		expect(await refusal(streamed(1000))).toMatchObject({ code: "payload_too_large" });
		// The reader stopped near the first chunk past the limit instead of draining the stream.
		expect(sent).toBeLessThanOrEqual(BODY_LIMIT_BYTES / chunk.byteLength + 2);
	});

	it("escapes ~ and / in a JSON Pointer", () => {
		expect(jsonPointer(["a/b", "c~d", 0])).toBe("/a~1b/c~0d/0");
		expect(jsonPointer([])).toBe("");
	});
});

describe("bearer secrets", () => {
	it("takes a secret of the endpoint's kind", () => {
		expect(bearerSecret(withHeader("Authorization", "Bearer cva_abc"), "admin")).toEqual({
			ok: true,
			value: "cva_abc",
		});
		expect(
			bearerSecret(withHeader("Authorization", "bearer cvp_abc"), "participant"),
		).toMatchObject({ ok: true });
	});

	it("refuses the other kind with its own code", async () => {
		const refused = bearerSecret(withHeader("Authorization", "Bearer cvp_abc"), "admin");
		const response = refused.ok ? new Response() : refused.response;

		expect(response.status).toBe(403);
		expect((await problemOf(response)).code).toBe("wrong_secret_kind");
	});

	it("refuses a missing, malformed or unprefixed secret as unauthorized", () => {
		const requests = [
			new Request("http://localhost/api/v1/x"),
			withHeader("Authorization", "Basic cva_abc"),
			withHeader("Authorization", "Bearer"),
			withHeader("Authorization", "Bearer abc"),
		];

		const answers = requests.map((request) => {
			const refused = bearerSecret(request, "admin");
			const response = refused.ok ? new Response() : refused.response;

			return [response.status, response.headers.get("WWW-Authenticate")];
		});

		expect(answers).toEqual(Array.from({ length: requests.length }, () => [401, "Bearer"]));
	});
});

describe("secrets in the query string", () => {
	it("finds a secret's prefix in a name or value, and a parameter named for a secret", () => {
		expect(hasSecret("minPeople=2")).toBe(false);
		expect(hasSecret("a=cva_x")).toBe(true);
		expect(hasSecret("cvp_x")).toBe(true);
		expect(hasSecret("Access_Token=1")).toBe(true);
		expect(hasSecret("secret=")).toBe(true);
	});
});

describe("If-None-Match", () => {
	it("matches a listed or weak tag and the wildcard", () => {
		expect(matchesIfNoneMatch(withHeader("If-None-Match", '"a", W/"b"'), '"b"')).toBe(true);
		expect(matchesIfNoneMatch(withHeader("If-None-Match", "*"), '"b"')).toBe(true);
		expect(matchesIfNoneMatch(withHeader("If-None-Match", '"a"'), '"b"')).toBe(false);
		expect(matchesIfNoneMatch(new Request("http://localhost/"), '"b"')).toBe(false);
	});
});

function context(params: PathParams) {
	return { params: Promise.resolve(params) };
}

function ok() {
	return new Response(null, { status: 204 });
}

describe("the frame of every answer", () => {
	it("turns a thrown error into internal_error and logs only its class name", async () => {
		class QueryFailed extends Error {}

		const logged = vi.spyOn(console, "error");

		const failing = endpoint(() => {
			throw new QueryFailed("insert into tokens values ('cvp_secret')");
		});

		const response = await failing(new Request("http://localhost/api/v1/x"), context({}));

		expect(response.status).toBe(500);
		expect(response.headers.get("Content-Type")).toBe("application/problem+json");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
		expect((await problemOf(response)).code).toBe("internal_error");
		expect(logged.mock.calls).toEqual([["An API request failed with QueryFailed."]]);

		logged.mockRestore();
	});

	it("answers a path id that cannot exist as not found, or as unauthorized behind a secret", async () => {
		const open = endpoint(ok);
		const secured = securedEndpoint("admin", ok);
		const withSecret = withHeader("Authorization", "Bearer cva_abc");

		expect(
			(await open(new Request("http://localhost/"), context({ id: "abcdefghijkm" }))).status,
		).toBe(204);
		expect(
			(await problemOf(await open(new Request("http://localhost/"), context({ id: "x" })))).code,
		).toBe("not_found");
		expect(
			(await secured(withSecret, context({ id: "abcdefghijkm", participantId: "0O1lI" }))).status,
		).toBe(401);
		// The secret is checked first, so a wrong kind is still told apart.
		expect(
			(await secured(withHeader("Authorization", "Bearer cvp_abc"), context({ id: "x" }))).status,
		).toBe(403);
	});

	it("answers on a path without parameters, for which Next.js passes no params", async () => {
		const request = new Request("http://localhost/api/v1/events");

		expect((await staticEndpoint(ok)(request, {})).status).toBe(204);
		expect((await problemOf(await endpoint(ok)(request, {}))).code).toBe("not_found");
		expect((await routeMethods(["POST"]).notAllowed(request, {})).status).toBe(405);
	});

	it("answers a method the route does not have with 405 and the allowed methods", async () => {
		const { notAllowed, preflight } = routeMethods(["GET", "PATCH"]);

		const response = await notAllowed(
			new Request("http://localhost/", { method: "PUT" }),
			context({}),
		);

		expect(response.status).toBe(405);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			allow: "GET, PATCH, HEAD, OPTIONS",
			"cache-control": "no-store",
			"access-control-allow-origin": "*",
		});
		expect((await problemOf(response)).code).toBe("method_not_allowed");

		const leaked = await notAllowed(new Request("http://localhost/?token=x"), context({}));

		expect((await problemOf(leaked)).code).toBe("secret_in_query");
		expect(
			(await preflight(new Request("http://localhost/"), context({}))).headers.get("Allow"),
		).toBe("GET, PATCH, HEAD, OPTIONS");
	});

	it("lets a script on another origin read the headers a client needs", async () => {
		const response = await endpoint(ok)(new Request("http://localhost/"), context({}));

		expect(response.headers.get("Access-Control-Expose-Headers")?.split(", ")).toEqual(
			expect.arrayContaining(["Allow", "ETag", "Location", "Retry-After", "WWW-Authenticate"]),
		);
	});
});

describe("daily times", () => {
	it("turns HH:MM into minutes and back, with 24:00 as the end of the day", () => {
		expect(clockMinutes("17:30")).toBe(1050);
		expect(clockMinutes("24:00")).toBe(1440);
		expect(clockTime(1050)).toBe("17:30");
		expect(clockTime(0)).toBe("00:00");
		expect(clockTime(1440)).toBe("24:00");
	});
});
