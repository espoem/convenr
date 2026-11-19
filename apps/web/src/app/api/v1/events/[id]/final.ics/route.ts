import { calendarFile } from "@/domain/calendar";
import { endpoint, entityTag, matchesIfNoneMatch, problem, routeMethods } from "@/server/api/http";
import { calendarEntryOf } from "@/server/calendar";
import { eventVersion, readEvent } from "@/server/events";

/** The final time as an iCalendar file, the one answer of the API that is not JSON. */
export const GET = endpoint<{ id: string }>(async (request, { id }) => {
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

	const entry = calendarEntryOf(view, new URL(request.url).origin);

	if (entry === undefined) {
		return problem("not_finalized");
	}

	return new Response(calendarFile(entry, Temporal.Now.instant()), {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": `attachment; filename="${view.segment}.ics"`,
			ETag: entityTag(view.version),
		},
	});
});

const methods = routeMethods(["GET"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
