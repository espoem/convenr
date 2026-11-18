import { endpoint, json, problem, readQuery, routeMethods } from "@/server/api/http";
import { windowsBody } from "@/server/api/mapping";
import { windowsQuerySchema, windowsSchema } from "@/server/api/schemas";
import { readEvent } from "@/server/events";

export const GET = endpoint<{ id: string }>(async (request, { id }) => {
	const filters = readQuery(request, windowsQuerySchema);

	if (!filters.ok) {
		return filters.response;
	}

	const view = await readEvent(id);

	return view === undefined
		? problem("not_found")
		: json(windowsSchema, windowsBody(view, filters.value));
});

const methods = routeMethods(["GET"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
