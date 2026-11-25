import { calendarFile } from "@/domain/calendar";
import { endpoint, entityTag, matchesIfNoneMatch, problem, routeMethods } from "@/server/api/http";
import { calendarEntryOf } from "@/server/calendar";
import { readEvent } from "@/server/events";

/** The final time as an iCalendar file, the one answer of the API that is not JSON. */
export const GET = endpoint<{ id: string }>(async (request, { id }) => {
	const view = await readEvent(id);

	if (view === undefined) {
		return problem("not_found");
	}

	const entry = calendarEntryOf(view, new URL(request.url).origin);

	if (entry === undefined) {
		return problem("not_finalized");
	}

	const tag = entityTag(view.version);

	if (matchesIfNoneMatch(request, tag)) {
		return new Response(null, { status: 304, headers: { ETag: tag } });
	}

	return new Response(calendarFile(entry, Temporal.Now.instant()), {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": `attachment; filename="${view.segment}.ics"`,
			ETag: tag,
		},
	});
});

const methods = routeMethods(["GET"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
