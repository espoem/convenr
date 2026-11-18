// Calls the API's route handlers directly with `Request` objects, for the database tests.
import { expect } from "vitest";
import type { z } from "zod";

import { POST as join } from "@/app/api/v1/events/[id]/participants/route";
import { POST as createEvent } from "@/app/api/v1/events/route";

import {
	type CreateEventRequest,
	createdEventSchema,
	joinedSchema,
	problemSchema,
} from "./schemas";

type Handler<Params> = (
	request: Request,
	context: { params: Promise<Params> },
) => Promise<Response>;

export type Call = {
	method?: string;
	/** The path after `/api/v1`, with any query string; handlers only read the query. */
	path?: string;
	body?: unknown;
	/** Sent as `Authorization: Bearer`. */
	secret?: string;
	headers?: Record<string, string>;
};

export async function call<Params>(
	handler: Handler<Params>,
	params: Params,
	{ method = "GET", path = "/", body, secret, headers = {} }: Call = {},
): Promise<Response> {
	const sent = new Headers(headers);

	if (secret !== undefined) {
		sent.set("Authorization", `Bearer ${secret}`);
	}

	if (body !== undefined && !sent.has("Content-Type")) {
		sent.set("Content-Type", "application/json");
	}

	const request = new Request(`http://localhost/api/v1${path}`, {
		method,
		headers: sent,
		body: body === undefined ? null : JSON.stringify(body),
	});

	return handler(request, { params: Promise.resolve(params) });
}

/**
 * The body of `response` checked against `schema`. Parsing drops fields the schema does not
 * name, so the comparison fails when the response holds anything more.
 */
export async function bodyOf<Schema extends z.ZodType>(
	response: Response,
	schema: Schema,
): Promise<z.output<Schema>> {
	const body: unknown = await response.json();
	const parsed = schema.parse(body);

	expect(parsed).toEqual(body);

	return parsed;
}

/** The status and problem code of a refusal, after checking it is a problem document. */
export async function refusalOf(response: Response) {
	expect(response.headers.get("Content-Type")).toBe("application/problem+json");

	const problem = await bodyOf(response, problemSchema);

	expect(problem.status).toBe(response.status);

	return problem;
}

export const pragueEvenings = {
	name: "Schůzka výboru",
	description: "V klubovně.",
	referenceZone: "Europe/Prague",
	schedule: {
		mode: "range",
		first: "2027-04-05",
		last: "2027-04-06",
		dailyStart: "17:00",
		dailyEnd: "19:00",
		slotMinutes: 60,
	},
} satisfies CreateEventRequest;

/** 17:00 and 18:00 in Prague on 5 April 2027. */
export const FIVE = { start: "2027-04-05T15:00:00Z" };
export const SIX = { start: "2027-04-05T16:00:00Z" };

export async function createdEvent(body: CreateEventRequest = pragueEvenings) {
	const response = await call(createEvent, {}, { method: "POST", path: "/events", body });

	expect(response.status).toBe(201);

	const created = await bodyOf(response, createdEventSchema);

	return { id: created.event.id, adminSecret: created.adminSecret, event: created.event };
}

/** Joins under a new name, with `newPassword` set when given. */
export async function joined(id: string, name: string, newPassword?: string) {
	const response = await call(
		join,
		{ id },
		{
			method: "POST",
			path: `/events/${id}/participants`,
			body: newPassword === undefined ? { name } : { name, newPassword },
		},
	);

	expect(response.status).toBe(200);

	const body = await bodyOf(response, joinedSchema);

	return { participantId: body.participant.id, token: body.participantToken };
}
