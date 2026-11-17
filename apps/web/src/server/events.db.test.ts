import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { events } from "@/db/schema";

import { createEvent, readEvent } from "./events";
import { join } from "./participants";
import { saveResponse } from "./responses";
import { hashSecret } from "./secrets";
import { creationTime, freshEvent, mondayEvenings, pragueEvenings } from "./test-events";

beforeEach(async () => {
  await db().delete(events);
});

describe("createEvent", () => {
  it("creates an event with a share segment, an admin secret and a deletion date (E6, E7, E10)", async () => {
    const created = await createEvent(pragueEvenings, creationTime);

    expect(created).toMatchObject({ ok: true });

    if (!created.ok) {
      return;
    }

    expect(created.segment).toBe(`schuzka-vyboru-2027-${created.id}`);
    expect(created.adminSecret).toMatch(/^[\w-]{43}$/);
    expect(created.deletionDate.toString()).toBe("2027-07-05");

    const [row] = await db().select().from(events).where(eq(events.id, created.id));

    // Only the hash of the admin secret is stored (ADR 0003).
    expect(row?.adminSecretHash).toBe(hashSecret(created.adminSecret));
    expect(JSON.stringify(row)).not.toContain(created.adminSecret);
  });

  it("refuses invalid fields and broken schedule rules without storing anything", async () => {
    const created = await createEvent(
      {
        ...pragueEvenings,
        name: "   ",
        referenceZone: "Mars/Olympus",
        days: { mode: "range", first: "2027-02-01", last: "2027-02-02" },
      },
      creationTime,
    );

    expect(created).toEqual({ ok: false, problems: ["name", "referenceZone"] });
    expect(
      await createEvent(
        { ...pragueEvenings, days: { mode: "range", first: "2027-02-01", last: "2027-02-02" } },
        creationTime,
      ),
    ).toEqual({
      ok: false,
      problems: ["E2.date-in-past"],
    });
    expect(await db().select().from(events)).toEqual([]);
  });
});

describe("readEvent", () => {
  it("returns nothing for an unknown id (E9)", async () => {
    expect(await readEvent("abcdefghijkm")).toBeUndefined();
  });

  it("shows details, slots and every participant's availability to anyone (V1)", async () => {
    const id = await freshEvent();
    const jana = await join(id, "Jana", undefined, creationTime);

    await join(id, "Petr", undefined, creationTime);

    if (!jana.ok) {
      throw new Error("Jana could not join.");
    }

    await saveResponse(id, jana.token, ["2027-04-05T15:00:00Z"], creationTime);

    const view = await readEvent(id);

    expect(view).toMatchObject({
      name: "Schůzka výboru 2027",
      description: "Kdy se sejdeme?\nV klubovně.",
      slots: [
        "2027-04-05T15:00:00Z",
        "2027-04-05T16:00:00Z",
        "2027-04-06T15:00:00Z",
        "2027-04-06T16:00:00Z",
      ],
      participants: [
        { name: "Jana", available: ["2027-04-05T15:00:00Z"] },
        { name: "Petr", available: [] },
      ],
    });
  });

  it("moves a weekday event's deletion date with each change (E7)", async () => {
    const id = await freshEvent(mondayEvenings);
    const later = Temporal.Instant.from("2027-05-10T08:00:00Z");

    await join(id, "Jana", undefined, later);

    expect((await readEvent(id))?.deletionDate.toString()).toBe("2027-08-08");
  });
});
