// Saving a response: spec rules R1 to R4.
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { datedAvailability, weekdayAvailability } from "@/db/schema";
import { scheduleSlots, slotKey } from "@/domain/schedule";

import { participantByToken, scheduleOf, touchEvent } from "./event-rows";

export type SaveResult = { ok: true } | { ok: false; problem: "not-joined" | "unknown-slot" };

/**
 * Replaces the response of the token's participant with `keys` in one step (R2). The later
 * of two saves wins as a whole (R3). A key the event does not have refuses the save (R4).
 */
export async function saveResponse(
  eventId: string,
  token: string,
  keys: string[],
  now = Temporal.Now.instant(),
): Promise<SaveResult> {
  const found = await participantByToken(db(), eventId, token);

  if (found === undefined) {
    return { ok: false, problem: "not-joined" };
  }

  const slots = new Map(
    scheduleSlots(scheduleOf(found.event)).map((slot) => [slotKey(slot), slot]),
  );

  const chosen = [...new Set(keys)].map((key) => slots.get(key));

  if (chosen.includes(undefined)) {
    return { ok: false, problem: "unknown-slot" };
  }

  const participantId = found.participant.id;

  await db().transaction(async (tx) => {
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
  });

  return { ok: true };
}
