import {
	endpoint,
	entityTag,
	json,
	matchesIfNoneMatch,
	problem,
	readQuery,
	routeMethods,
} from "@/server/api/http";
import { windowsBody } from "@/server/api/mapping";
import { windowsQuerySchema, windowsSchema } from "@/server/api/schemas";
import { eventVersion, readEvent } from "@/server/events";

export const GET = endpoint<{ id: string }>(async (request, { id }) => {
	const filters = readQuery(request, windowsQuerySchema);

	if (!filters.ok) {
		return filters.response;
	}

	const version = await eventVersion(id);

	if (version === null) {
		return problem("not_found");
	}

	const tag = entityTag(version);

	if (matchesIfNoneMatch(request, tag)) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	const view = await readEvent(id);

	if (view === undefined) {
		return problem("not_found");
	}

	const response = json(windowsSchema, windowsBody(view, filters.value));

	response.headers.set("ETag", entityTag(view.version));

	return response;
});

const methods = routeMethods(["GET"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
