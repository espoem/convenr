import { json, noContent, routeMethods, securedEndpoint, unauthorized } from "@/server/api/http";
import { participantBody } from "@/server/api/mapping";
import { participantSchema } from "@/server/api/schemas";
import { leave, readParticipant } from "@/server/participants";

type Params = { id: string };

export const GET = securedEndpoint<Params>("participant", async (_request, { id }, token) => {
	const found = await readParticipant(id, token);

	return found === undefined
		? unauthorized()
		: json(participantSchema, participantBody(found.participant, found.schedule));
});

export const DELETE = securedEndpoint<Params>("participant", async (_request, { id }, token) =>
	(await leave(id, token)).ok ? noContent() : unauthorized(),
);

const methods = routeMethods(["GET", "DELETE"]);

export const OPTIONS = methods.preflight;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
