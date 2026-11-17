"use server";
// Server Actions for creating an event and checking its admin link (ADR 0001). A browser
// can send anything, so each action checks the shape of its arguments; the data access
// layer applies the rules. Results carry strings, because Temporal values do not serialize.

import { z } from "zod";

import { createEvent, isAdminSecret, type NewEvent } from "./events";

export async function createEventAction(input: NewEvent) {
  const created = await createEvent(input);

  return created.ok ? { ...created, deletionDate: created.deletionDate.toString() } : created;
}

export async function checkAdminAction(id: string, adminSecret: string): Promise<boolean> {
  const args = z.tuple([z.string().max(64), z.string().max(128)]).safeParse([id, adminSecret]);

  return args.success && (await isAdminSecret(...args.data));
}
