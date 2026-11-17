import { describe, expect, it } from "vitest";

import { readEvent } from "./events";
import { join } from "./participants";
import { saveResponse } from "./responses";
import { creationTime, freshEvent, mondayEvenings } from "./test-events";

async function joined(eventId: string): Promise<string> {
  const result = await join(eventId, "Jana", undefined, creationTime);

  if (!result.ok) {
    throw new Error(`Jana could not join: ${result.problem}`);
  }

  return result.token;
}

async function availability(eventId: string) {
  return (await readEvent(eventId))?.participants[0]?.available.toSorted();
}

describe("saveResponse", () => {
  it("replaces the stored set as a whole, and the later save wins (R2, R3)", async () => {
    const eventId = await freshEvent();
    const token = await joined(eventId);

    await saveResponse(eventId, token, ["2027-04-05T15:00:00Z", "2027-04-05T16:00:00Z"]);
    await saveResponse(eventId, token, ["2027-04-06T16:00:00Z"]);

    expect(await availability(eventId)).toEqual(["2027-04-06T16:00:00Z"]);
  });

  it("refuses the whole save when one slot is not the event's (R4)", async () => {
    const eventId = await freshEvent();
    const token = await joined(eventId);

    await saveResponse(eventId, token, ["2027-04-05T15:00:00Z"]);

    expect(
      await saveResponse(eventId, token, ["2027-04-05T16:00:00Z", "2027-04-05T15:30:00Z"]),
    ).toEqual({ ok: false, problem: "unknown-slot" });
    expect(await availability(eventId)).toEqual(["2027-04-05T15:00:00Z"]);
  });

  it("stores weekday slots by day and minute, and counts duplicates once", async () => {
    const eventId = await freshEvent(mondayEvenings);
    const token = await joined(eventId);

    expect(await saveResponse(eventId, token, ["w3-1080", "w1-1020", "w3-1080"])).toEqual({
      ok: true,
    });
    expect(await availability(eventId)).toEqual(["w1-1020", "w3-1080"]);
  });

  it("refuses a token that does not belong to the event", async () => {
    const eventId = await freshEvent();

    expect(await saveResponse(eventId, "not-a-token", [])).toEqual({
      ok: false,
      problem: "not-joined",
    });
  });
});
