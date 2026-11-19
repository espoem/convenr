import {
	endpoint,
	entityTag,
	ifMatchPrecondition,
	matchesIfNoneMatch,
	noContent,
	problem,
	readJson,
	routeMethods,
	securedEndpoint,
	unauthorized,
} from "@/server/api/http";
import {
	confirmationOf,
	eventChangeOf,
	eventProblemResponse,
	eventResponse,
} from "@/server/api/mapping";
import { updateEventRequestSchema } from "@/server/api/schemas";
import { eventVersion, readEvent } from "@/server/events";
import { removeEvent, updateEvent } from "@/server/manage";

type Params = { id: string };

export const GET = endpoint<Params>(async (request, { id }) => {
	const version = await eventVersion(id);

	if (version === null) {
		return problem("not_found");
	}

	const tag = entityTag(version);

	if (matchesIfNoneMatch(request, tag)) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	const view = await readEvent(id);

	return view === undefined ? problem("not_found") : eventResponse(view);
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
		ifMatchPrecondition(request),
		undefined,
		confirmationOf(body.value),
	);

	switch (result.status) {
		case "denied":
			return unauthorized();
		case "invalid":
			return eventProblemResponse(result.problems);
		case "changed":
			return problem("event_changed", { headers: { ETag: entityTag(result.version) } });
		case "confirm":
			return problem("confirmation_required", {
				members: { losing: result.losing, clearsFinal: result.clearsFinal },
				headers: { ETag: entityTag(result.version) },
			});
		case "saved":
			return eventResponse(result.event);
	}
});

export const DELETE = securedEndpoint<Params>("admin", async (_request, { id }, secret) =>
	(await removeEvent(id, secret)) ? noContent() : unauthorized(),
);

const methods = routeMethods(["GET", "PATCH", "DELETE"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
