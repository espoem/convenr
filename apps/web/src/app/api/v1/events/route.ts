import { json, readJson, routeMethods, staticEndpoint } from "@/server/api/http";
import { eventBody, eventProblemResponse, newEventOf } from "@/server/api/mapping";
import { createdEventSchema, createEventRequestSchema } from "@/server/api/schemas";
import { createEvent } from "@/server/events";

export const POST = staticEndpoint(async (request) => {
	const body = await readJson(request, createEventRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	const created = await createEvent(newEventOf(body.value));

	if (!created.ok) {
		return eventProblemResponse(created.problems);
	}

	const response = json(
		createdEventSchema,
		{ event: eventBody(created.event), adminSecret: created.adminSecret },
		{ status: 201, secret: true },
	);

	response.headers.set("Location", `/api/v1/events/${created.event.id}`);

	return response;
});

const methods = routeMethods(["POST"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
