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
import { byToken } from "@/server/event-rows";
import { sendSoon } from "@/server/outbox";
import { saveResponse } from "@/server/responses";

/** The refusal of a save, pointing at each slot the event does not have by its index. */
function unknownSlots(indexes: number[]): Response {
	return problem("unknown_slot", {
		errors: indexes.map((index) => ({ pointer: `/availability/${index}`, code: "unknown_slot" })),
	});
}

/** The refusal of a save with a slot at if need be that `availability` leaves out. */
function notAvailable(indexes: number[]): Response {
	return problem("invalid_request", {
		errors: indexes.map((index) => ({
			pointer: `/ifNeedBe/${index}`,
			code: "if_need_be_not_available",
		})),
	});
}

export const PUT = securedEndpoint<{ id: string }>(
	"participant",
	async (request, { id }, token) => {
		const body = await readJson(request, availabilityRequestSchema);

		if (!body.ok) {
			return body.response;
		}

		const { availability, ifNeedBe } = body.value;

		const saved = await saveResponse(id, byToken(token), {
			available: availability.map((slot) => slotKeyOf(slot)),
			ifNeedBe: ifNeedBe?.map((slot) => slotKeyOf(slot)),
		});

		sendSoon();

		if (!saved.ok) {
			switch (saved.problem) {
				case "not_joined":
					return unauthorized();
				case "unknown_slot":
					return unknownSlots(saved.unknown);
				case "if_need_be_not_available":
					return notAvailable(saved.notAvailable);
			}
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
