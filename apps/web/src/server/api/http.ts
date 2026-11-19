// HTTP concerns of the public API: problem responses, JSON bodies, bearer secrets, the query
// string check, path ids, caching and cross-origin headers, and the answer to a failure.
// Nothing here logs a header, body or query string (ADR 0003 item 8).
import type { z } from "zod";

import { isPublicId } from "@/domain/public-id";
import { type SecretKind, secretKind } from "@/server/secrets";

import { fieldErrors } from "./field-codes";
import type { FieldError, ProblemBody } from "./schemas";

export const BODY_LIMIT_BYTES = 64 * 1024;

/** The base of every problem's `type`; the code completes it. */
export const PROBLEM_TYPE_BASE = "https://convenr.party/problems/";

/** Every problem code the API sends, with its status and a title that does not vary. */
export const PROBLEMS = {
	invalid_request: [400, "The request does not match the schema."],
	secret_in_query: [400, "A secret was sent in the query string."],
	unauthorized: [401, "The secret is missing or wrong."],
	wrong_secret_kind: [403, "This endpoint takes the other kind of secret."],
	password_required: [403, "This name has a password."],
	wrong_password: [403, "The password does not match."],
	not_found: [404, "The event or participant does not exist."],
	method_not_allowed: [405, "This path does not support the method."],
	event_full: [409, "The event already has 100 participants."],
	field_locked: [409, "Slot length, day mode and reference zone cannot change once people joined."],
	no_password: [409, "The participant has no password."],
	name_exists: [409, "A participant already uses this name."],
	name_unknown: [409, "No participant uses this name."],
	confirmation_required: [409, "The change would remove availability from participants."],
	payload_too_large: [413, "The body is larger than 64 KB."],
	unsupported_media_type: [415, "The body must be application/json in UTF-8."],
	no_days: [422, "The event has no day."],
	range_reversed: [422, "The last day is before the first."],
	too_many_dates: [422, "The event has more than 31 dates."],
	duplicate_day: [422, "A day is chosen more than once."],
	date_in_past: [422, "A date lies before today in the reference zone."],
	out_of_day: [422, "A daily time lies outside 00:00 to 24:00."],
	end_not_after_start: [422, "The daily end is not after the daily start."],
	not_on_slot_boundary: [422, "A daily time is not a multiple of the slot length."],
	invalid_name: [422, "The display name is empty, too long or has a control character."],
	invalid_password: [422, "A password has 4 to 128 characters."],
	unknown_slot: [422, "The availability holds a slot the event does not have."],
	too_many_attempts: [429, "Too many wrong passwords in a row."],
	internal_error: [500, "The server failed to answer the request."],
} as const satisfies Record<string, readonly [number, string]>;

export type ProblemCode = keyof typeof PROBLEMS;

export type ProblemOptions = {
	errors?: FieldError[];
	/** Members of the problem object that only some codes carry. */
	members?: Pick<ProblemBody, "retryAt" | "losing">;
	headers?: Record<string, string>;
};

/** An RFC 9457 problem response. */
export function problem(code: ProblemCode, options: ProblemOptions = {}): Response {
	const [status, title] = PROBLEMS[code];
	const errors = options.errors === undefined ? {} : { errors: options.errors };
	const body = { type: `${PROBLEM_TYPE_BASE}${code}`, status, title, code };

	return new Response(JSON.stringify({ ...body, ...errors, ...options.members }), {
		status,
		headers: { "Content-Type": "application/problem+json", ...options.headers },
	});
}

/**
 * A JSON response of `body` as `schema` shapes it, which drops any field the schema does not
 * name. `secret` marks a body that holds a secret, which no cache may keep.
 */
export function json<Schema extends z.ZodType>(
	schema: Schema,
	body: z.input<Schema>,
	init: { status?: number; secret?: boolean } = {},
): Response {
	return Response.json(schema.parse(body), {
		status: init.status ?? 200,
		headers: init.secret === true ? { "Cache-Control": "no-store" } : {},
	});
}

export function noContent(): Response {
	return new Response(null, { status: 204 });
}

/** An RFC 6901 JSON Pointer to `path` in a document. */
export function jsonPointer(path: readonly PropertyKey[]): string {
	return path.map((key) => `/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

/** Each value at fault in a request body, at its JSON Pointer, with the API's field code. */
export function schemaErrors(error: z.ZodError): FieldError[] {
	return fieldErrors(error.issues).map(({ path, code }) => ({ pointer: jsonPointer(path), code }));
}

export type Parsed<Value> = { ok: true; value: Value } | { ok: false; response: Response };

function isJsonMediaType(contentType: string | null): boolean {
	const [type, ...parameters] = (contentType ?? "").split(";").map((part) => part.trim());

	const charsetIsUtf8 = parameters.every((parameter) => {
		const [name, value] = parameter.split("=").map((part) => part.trim().toLowerCase());

		return name !== "charset" || value === "utf-8" || value === '"utf-8"';
	});

	return type?.toLowerCase() === "application/json" && charsetIsUtf8;
}

/** The body's bytes, or `undefined` once it grows past the limit; the rest is not read. */
async function boundedBytes(request: Request): Promise<Uint8Array | undefined> {
	// A declared length is checked first; a body without one is still counted as it arrives.
	if (Number(request.headers.get("content-length") ?? "0") > BODY_LIMIT_BYTES) {
		return undefined;
	}

	if (request.body === null) {
		return new Uint8Array();
	}

	const chunks: Uint8Array[] = [];
	let size = 0;

	for await (const chunk of request.body) {
		size += chunk.byteLength;

		// Leaving the loop cancels the stream, so the rest is never read.
		if (size > BODY_LIMIT_BYTES) {
			return undefined;
		}

		chunks.push(chunk);
	}

	return Buffer.concat(chunks, size);
}

/** The request body as JSON in UTF-8 of at most 64 KB, checked against `schema`. */
export async function readJson<Schema extends z.ZodType>(
	request: Request,
	schema: Schema,
): Promise<Parsed<z.output<Schema>>> {
	if (!isJsonMediaType(request.headers.get("content-type"))) {
		return { ok: false, response: problem("unsupported_media_type") };
	}

	const bytes = await boundedBytes(request);

	if (bytes === undefined) {
		return { ok: false, response: problem("payload_too_large") };
	}

	let value: unknown;

	try {
		value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
	} catch {
		return { ok: false, response: problem("invalid_request") };
	}

	// The reported input tells a missing field from one of the wrong type.
	const parsed = schema.safeParse(value, { reportInput: true });

	return parsed.success
		? { ok: true, value: parsed.data }
		: { ok: false, response: problem("invalid_request", { errors: schemaErrors(parsed.error) }) };
}

/** The query string checked against `schema`; a failed check names the parameter. */
export function readQuery<Schema extends z.ZodType>(
	request: Request,
	schema: Schema,
): Parsed<z.output<Schema>> {
	const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams), {
		reportInput: true,
	});

	if (parsed.success) {
		return { ok: true, value: parsed.data };
	}

	const errors = fieldErrors(parsed.error.issues).map(({ path, code }) => ({
		parameter: String(path[0] ?? ""),
		code,
	}));

	return { ok: false, response: problem("invalid_request", { errors }) };
}

/** The same answer whether the secret is missing, wrong or for an event that does not exist. */
export function unauthorized(): Response {
	return problem("unauthorized", { headers: { "WWW-Authenticate": "Bearer" } });
}

/** The secret of kind `kind` from `Authorization: Bearer` (ADR 0004 item 2). */
export function bearerSecret(request: Request, kind: SecretKind): Parsed<string> {
	const match = /^Bearer +(\S+) *$/iu.exec(request.headers.get("authorization") ?? "");
	const secret = match?.[1];

	if (secret === undefined) {
		return { ok: false, response: unauthorized() };
	}

	const held = secretKind(secret);

	if (held === undefined) {
		return { ok: false, response: unauthorized() };
	}

	return held === kind
		? { ok: true, value: secret }
		: { ok: false, response: problem("wrong_secret_kind") };
}

const SECRET_PARAMETERS = new Set(["token", "secret", "access_token"]);

/**
 * Whether the query string holds a secret: a name or value with a secret's prefix, or a
 * parameter whose name says it is one. The request is refused, so no secret is ever taken
 * from an address (ADR 0004 item 3).
 */
export function hasSecretInQuery(url: URL): boolean {
	return [...url.searchParams].some(
		([name, value]) =>
			SECRET_PARAMETERS.has(name.toLowerCase()) ||
			secretKind(name) !== undefined ||
			secretKind(value) !== undefined,
	);
}

/** `version` as a strong entity tag. */
export function entityTag(version: string): string {
	return `"${version}"`;
}

/** Whether `If-None-Match` names `tag`, compared weakly as RFC 9110 asks for this header. */
export function matchesIfNoneMatch(request: Request, tag: string): boolean {
	const header = request.headers.get("if-none-match");

	if (header === null) {
		return false;
	}

	return header
		.split(",")
		.map((candidate) => candidate.trim().replace(/^W\//u, ""))
		.some((candidate) => candidate === "*" || candidate === tag);
}

const ALLOWED_HEADERS = "Authorization, Content-Type, If-None-Match";
const EXPOSED_HEADERS = "Allow, ETag, Location, Retry-After, WWW-Authenticate";

/**
 * Headers every API response carries. A request that carried a secret is never cached, and
 * neither is an answer marked `noStore`.
 */
function finish(request: Request, response: Response, noStore: boolean): Response {
	const headers = response.headers;

	headers.set("Access-Control-Allow-Origin", "*");
	headers.set("Access-Control-Expose-Headers", EXPOSED_HEADERS);
	headers.set("X-Content-Type-Options", "nosniff");

	if (noStore || request.headers.has("authorization")) {
		headers.set("Cache-Control", "no-store");
	} else if (!headers.has("Cache-Control")) {
		headers.set("Cache-Control", "no-cache");
	}

	return response;
}

/** Path parameters: one segment each, or the segments of a catch-all. */
export type PathParams = Record<string, string | string[]>;

/** Next.js passes no `params` to a route whose path has no dynamic segment. */
export type RouteHandler<Params> = (
	request: Request,
	context: { params?: Promise<Params> },
) => Promise<Response>;

/**
 * The frame of every API answer: it refuses a secret in the query string before anything
 * else, adds the caching and cross-origin headers, and turns a thrown error into an
 * `internal_error` problem. A thrown error is logged by its class name only, because a query
 * error's message holds the query's parameters.
 */
function guarded<Params>(
	answer: (request: Request, params: Params | undefined) => Response | Promise<Response>,
): RouteHandler<Params> {
	return async (request, context) => {
		try {
			if (hasSecretInQuery(new URL(request.url))) {
				return finish(request, problem("secret_in_query"), true);
			}

			return finish(request, await answer(request, await context.params), false);
		} catch (error) {
			const failure = error instanceof Error ? error.constructor.name : "a thrown value";

			console.error(`An API request failed with ${failure}.`);

			return finish(request, problem("internal_error"), true);
		}
	};
}

/** Whether every single-segment path parameter is a public id; a catch-all's list is not one. */
function hasPublicIds(params: PathParams): boolean {
	return Object.values(params).every((value) => Array.isArray(value) || isPublicId(value));
}

/** A handler of an endpoint whose path has no parameters and that needs no secret. */
export function staticEndpoint(
	handle: (request: Request) => Response | Promise<Response>,
): RouteHandler<PathParams> {
	return guarded((request) => handle(request));
}

/** A handler of an endpoint that needs no secret. A path id that cannot exist is not found. */
export function endpoint<Params extends PathParams>(
	handle: (request: Request, params: Params) => Response | Promise<Response>,
): RouteHandler<Params> {
	return guarded((request, params: Params | undefined) =>
		params !== undefined && hasPublicIds(params) ? handle(request, params) : problem("not_found"),
	);
}

/**
 * A handler of an endpoint that needs a secret of `kind`, which it receives checked for its
 * kind. A path id that cannot exist gets the same 401 as a wrong secret.
 */
export function securedEndpoint<Params extends PathParams>(
	kind: SecretKind,
	handle: (request: Request, params: Params, secret: string) => Response | Promise<Response>,
): RouteHandler<Params> {
	return guarded((request, params: Params | undefined) => {
		const secret = bearerSecret(request, kind);

		if (!secret.ok) {
			return secret.response;
		}

		return params !== undefined && hasPublicIds(params)
			? handle(request, params, secret.value)
			: unauthorized();
	});
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * The answers a route gives besides its own methods: the preflight answer and the answer to
 * every method it does not support. A route with GET also answers HEAD, which Next.js derives
 * from GET.
 */
export function routeMethods(methods: Method[]) {
	const allowed = [...methods, ...(methods.includes("GET") ? ["HEAD"] : []), "OPTIONS"].join(", ");

	return {
		preflight: guarded(
			() =>
				new Response(null, {
					status: 204,
					headers: {
						"Access-Control-Allow-Methods": allowed,
						"Access-Control-Allow-Headers": ALLOWED_HEADERS,
						"Access-Control-Max-Age": "600",
						Allow: allowed,
					},
				}),
		),
		notAllowed: guarded(() =>
			problem("method_not_allowed", {
				headers: { Allow: allowed, "Cache-Control": "no-store" },
			}),
		),
	};
}
