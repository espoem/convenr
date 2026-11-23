import { endpoint, json, problem, readJson, routeMethods } from "@/server/api/http";
import { joinPasswordOf, participantBody, refusalResponse } from "@/server/api/mapping";
import { joinedSchema, joinRequestSchema } from "@/server/api/schemas";
import { sendSoon } from "@/server/outbox";
import { join } from "@/server/participants";

export const POST = endpoint<{ id: string }>(async (request, { id }) => {
	const body = await readJson(request, joinRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	const password = joinPasswordOf(body.value);

	if (password === undefined) {
		return problem("invalid_request", {
			errors: [{ pointer: "/newPassword", code: "not_allowed" }],
		});
	}

	const joined = await join(id, body.value.name, password);

	sendSoon();

	if (!joined.ok) {
		return refusalResponse(joined, { current: "/password", new: "/newPassword" });
	}

	return json(
		joinedSchema,
		{
			participant: participantBody(joined.participant, joined.schedule),
			participantToken: joined.token,
		},
		{ secret: true },
	);
});

const methods = routeMethods(["POST"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
