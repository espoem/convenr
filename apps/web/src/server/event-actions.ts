"use server";
// Server Actions for creating an event and checking its admin link (ADR 0001). A browser
// can send anything, so each action checks the shape of its arguments; the data access
// layer applies the rules.

import { z } from "zod";

import { createEvent, type CreateEventResult, isAdminSecret, type NewEvent } from "./events";

export async function createEventAction(input: NewEvent): Promise<CreateEventResult> {
	return createEvent(input);
}

export async function checkAdminAction(id: string, adminSecret: string): Promise<boolean> {
	const args = z.tuple([z.string().max(64), z.string().max(128)]).safeParse([id, adminSecret]);

	return args.success && (await isAdminSecret(...args.data));
}
