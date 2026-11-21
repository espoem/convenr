import {
	entityTag,
	ifMatchPrecondition,
	problem,
	readJson,
	routeMethods,
	securedEndpoint,
	unauthorized,
} from "@/server/api/http";
import { eventResponse, finalProblemResponse, finalRequestOf } from "@/server/api/mapping";
import { finalRequestSchema } from "@/server/api/schemas";
import { clearFinal, type FinalResult, pickFinal } from "@/server/final";
import { bySecret } from "@/server/manage";

type Params = { id: string };

function answer(result: FinalResult): Response {
	switch (result.status) {
		case "denied":
			return unauthorized();
		case "invalid":
			return finalProblemResponse(result.problem);
		case "changed":
			return problem("event_changed", { headers: { ETag: entityTag(result.version) } });
		case "saved":
			return eventResponse(result.event);
	}
}

export const PUT = securedEndpoint<Params>("admin", async (request, { id }, secret) => {
	const body = await readJson(request, finalRequestSchema);

	if (!body.ok) {
		return body.response;
	}

	return answer(
		await pickFinal(id, bySecret(secret), finalRequestOf(body.value), ifMatchPrecondition(request)),
	);
});

export const DELETE = securedEndpoint<Params>("admin", async (request, { id }, secret) =>
	answer(await clearFinal(id, bySecret(secret), ifMatchPrecondition(request))),
);

const methods = routeMethods(["PUT", "DELETE"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const POST = methods.notAllowed;
export const PATCH = methods.notAllowed;
