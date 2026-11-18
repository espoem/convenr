import {
	json,
	problem,
	readJson,
	routeMethods,
	securedEndpoint,
	unauthorized,
} from "@/server/api/http";
import { participantBody, slotKeyOf } from "@/server/api/mapping";
import { availabilityRequestSchema, participantSchema } from "@/server/api/schemas";
import { saveResponse } from "@/server/responses";

/** The refusal of a save, pointing at each slot the event does not have by its index. */
function unknownSlots(indexes: number[]): Response {
	return problem("unknown_slot", {
		errors: indexes.map((index) => ({ pointer: `/availability/${index}`, code: "unknown_slot" })),
	});
}

export const PUT = securedEndpoint<{ id: string }>(
	"participant",
	async (request, { id }, token) => {
		const body = await readJson(request, availabilityRequestSchema);

		if (!body.ok) {
			return body.response;
		}

		const keys = body.value.availability.map((slot) => slotKeyOf(slot));
		const saved = await saveResponse(id, token, keys);

		if (!saved.ok) {
			return saved.problem === "not_joined" ? unauthorized() : unknownSlots(saved.unknown);
		}

		return json(participantSchema, participantBody(saved.participant, saved.schedule));
	},
);

const methods = routeMethods(["PUT"]);

export const OPTIONS = methods.preflight;
export const GET = methods.notAllowed;
export const HEAD = methods.notAllowed;
export const POST = methods.notAllowed;
export const PATCH = methods.notAllowed;
export const DELETE = methods.notAllowed;
