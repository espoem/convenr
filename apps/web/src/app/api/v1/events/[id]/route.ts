import {
	endpoint,
	entityTag,
	json,
	matchesIfNoneMatch,
	noContent,
	problem,
	readJson,
	routeMethods,
	securedEndpoint,
	unauthorized,
} from "@/server/api/http";
import { eventBody, eventChangeOf, eventProblemResponse } from "@/server/api/mapping";
import { eventSchema, updateEventRequestSchema } from "@/server/api/schemas";
import { eventVersion, readEvent } from "@/server/events";
import { removeEvent, updateEvent } from "@/server/manage";

type Params = { id: string };

/** The event with its version as the entity tag. */
async function eventResponse(id: string): Promise<Response> {
	const view = await readEvent(id);

	if (view === undefined) {
		return problem("not_found");
	}

	const response = json(eventSchema, eventBody(view));

	response.headers.set("ETag", entityTag(view.version));

	return response;
}

export const GET = endpoint<Params>(async (request, { id }) => {
	const version = await eventVersion(id);

	if (version === null) {
		return problem("not_found");
	}

	const tag = entityTag(version);

	return matchesIfNoneMatch(request, tag)
		? new Response(null, { status: 304, headers: { ETag: tag } })
		: eventResponse(id);
});

export const PATCH = securedEndpoint<Params>("admin", async (request, { id }, secret) => {
	const body = await readJson(request, updateEventRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	const result = await updateEvent(
		id,
		secret,
		eventChangeOf(body.value),
		body.value.confirmedLosing ?? null,
	);

	switch (result.status) {
		case "denied":
			return unauthorized();
		case "invalid":
			return eventProblemResponse(result.problems);
		case "confirm":
			return problem("confirmation_required", { members: { losing: result.losing } });
		case "saved":
			return eventResponse(id);
	}
});

export const DELETE = securedEndpoint<Params>("admin", async (_request, { id }, secret) =>
	(await removeEvent(id, secret)) ? noContent() : unauthorized(),
);

const methods = routeMethods(["GET", "PATCH", "DELETE"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
