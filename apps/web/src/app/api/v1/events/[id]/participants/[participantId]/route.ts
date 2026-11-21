import { noContent, problem, routeMethods, securedEndpoint, unauthorized } from "@/server/api/http";
import { bySecret, removeParticipant } from "@/server/manage";

export const DELETE = securedEndpoint<{ id: string; participantId: string }>(
	"admin",
	async (_request, { id, participantId }, secret) => {
		const result = await removeParticipant(id, bySecret(secret), participantId);

		switch (result.status) {
			case "removed":
				return noContent();
			case "denied":
				return unauthorized();
			case "not_found":
				return problem("not_found");
		}
	},
);

const methods = routeMethods(["DELETE"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const POST = methods.notAllowed;
export const PUT = methods.notAllowed;
export const PATCH = methods.notAllowed;
