// Saving a response: the set of slots a participant is available for.
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { datedAvailability, events, weekdayAvailability } from "@/db/schema";
import { scheduleSlots, slotKey } from "@/domain/schedule";

import { participantByToken, scheduleOf, touchEvent } from "./event-rows";

export type SaveResult = { ok: true } | { ok: false; problem: "not_joined" | "unknown_slot" };

/**
 * Replaces the response of the token's participant with `keys` in one step. The later
 * of two saves wins as a whole. A key the event does not have refuses the save. The
 * event row stays locked from the check to the write, so an organizer's change that removes
 * slots happens wholly before or after the save.
 */
export async function saveResponse(
	eventId: string,
	token: string,
	keys: string[],
	now = Temporal.Now.instant(),
): Promise<SaveResult> {
	return db().transaction(async (tx): Promise<SaveResult> => {
		await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for("update");

		const found = await participantByToken(tx, eventId, token, now);

		if (found === undefined) {
			return { ok: false, problem: "not_joined" };
		}

		const slots = new Map(
			scheduleSlots(scheduleOf(found.event)).map((slot) => [slotKey(slot), slot]),
		);

		const chosen = [...new Set(keys)].map((key) => slots.get(key));

		if (chosen.includes(undefined)) {
			return { ok: false, problem: "unknown_slot" };
		}

		const participantId = found.participant.id;

		await tx.delete(datedAvailability).where(eq(datedAvailability.participantId, participantId));
		await tx
			.delete(weekdayAvailability)
			.where(eq(weekdayAvailability.participantId, participantId));

		const dated = [];
		const weekly = [];

		for (const slot of chosen) {
			if (slot?.kind === "dated") {
				dated.push({ participantId, slotStart: slot.start.toString() });
			} else if (slot?.kind === "weekday") {
				weekly.push({ participantId, weekday: slot.weekday, minute: slot.minute });
			}
		}

		if (dated.length > 0) {
			await tx.insert(datedAvailability).values(dated);
		}

		if (weekly.length > 0) {
			await tx.insert(weekdayAvailability).values(weekly);
		}

		await touchEvent(tx, found.event, now);

		return { ok: true };
	});
}
