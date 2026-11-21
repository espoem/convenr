// Saving a response: the level of each slot a participant marked.
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { datedAvailability, pollAvailability, weekdayAvailability } from "@/db/schema";
import { type LevelsInput, sameLevels, savedLevels } from "@/domain/levels";
import { scheduleSlots, slotKey } from "@/domain/schedule";

import {
	type Holder,
	participantForChange,
	type ParticipantRead,
	responseLevels,
	scheduleOf,
	touchEvent,
} from "./event-rows";

export type SaveResult =
	/** The participant as the save left them, so an answer needs no second read. */
	| ({ ok: true } & ParticipantRead)
	| { ok: false; problem: "not_joined" }
	/** `unknown` holds the index in `available` of each slot the event does not have. */
	| { ok: false; problem: "unknown_slot"; unknown: number[] }
	/** `notAvailable` holds the index in `ifNeedBe` of each slot missing from `available`. */
	| { ok: false; problem: "if_need_be_not_available"; notAvailable: number[] };

/**
 * Replaces the response of the holder's participant in one step. The later of two saves wins as
 * a whole. A slot the event does not have refuses the save. The event row stays locked from the
 * check to the write, so an organizer's change that removes slots happens wholly before or after
 * the save.
 */
export async function saveResponse(
	eventId: string,
	holder: Holder,
	input: LevelsInput,
	now = Temporal.Now.instant(),
): Promise<SaveResult> {
	return db().transaction(async (tx): Promise<SaveResult> => {
		const found = await participantForChange(tx, eventId, holder, now);

		if (found === undefined) {
			return { ok: false, problem: "not_joined" };
		}

		const schedule = scheduleOf(found.event);
		const slots = new Map(scheduleSlots(schedule).map((slot) => [slotKey(slot), slot]));
		const unknown = input.available.flatMap((key, index) => (slots.has(key) ? [] : [index]));

		if (unknown.length > 0) {
			return { ok: false, problem: "unknown_slot", unknown };
		}

		const { participant } = found;
		const participantId = participant.id;

		const stored =
			(await responseLevels(tx, found.event, [participantId])).get(participantId) ?? {};

		const wanted = savedLevels(input, stored);

		if (!wanted.ok) {
			return { ok: false, problem: "if_need_be_not_available", notAvailable: wanted.notAvailable };
		}

		const { levels } = wanted;

		const saved: SaveResult = {
			ok: true,
			participant: { id: participant.publicId, name: participant.displayName, levels },
			schedule,
		};

		// The same response again changes nothing, so it keeps the version and the deletion date.
		if (sameLevels(stored, levels)) {
			return saved;
		}

		await tx.delete(datedAvailability).where(eq(datedAvailability.participantId, participantId));
		await tx
			.delete(weekdayAvailability)
			.where(eq(weekdayAvailability.participantId, participantId));
		await tx.delete(pollAvailability).where(eq(pollAvailability.participantId, participantId));

		const dated = [];
		const weekly = [];
		const poll = [];

		for (const [key, level] of Object.entries(levels)) {
			const slot = slots.get(key);

			switch (slot?.kind) {
				case "dated":
					dated.push({ participantId, slotStart: slot.start.toString(), level });
					break;
				case "weekday":
					weekly.push({ participantId, weekday: slot.weekday, minute: slot.minute, level });
					break;
				case "option":
					poll.push({ participantId, eventId, optionId: slot.option, level });
					break;
				case undefined:
					break;
			}
		}

		if (dated.length > 0) {
			await tx.insert(datedAvailability).values(dated);
		}

		if (weekly.length > 0) {
			await tx.insert(weekdayAvailability).values(weekly);
		}

		if (poll.length > 0) {
			await tx.insert(pollAvailability).values(poll);
		}

		await touchEvent(tx, found.event, now);

		return saved;
	});
}
