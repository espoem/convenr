"use server";
// Server Actions for creating and managing an event (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The admin secret travels in the request body, never in an address (ADR 0003 item 2).

import { z } from "zod";

import type { FinalProblem, FinalRequest } from "@/domain/final-time";
import { isPublicId } from "@/domain/public-id";
import { type EventVersion, eventVersionSchema } from "@/lib/event-version";

import { createEvent, type EventProblem, eventVersion, type NewEvent } from "./events";
import { clearFinal, type FinalResult, pickFinal } from "./final";
import {
	type ManagedEvent,
	readManagedEvent,
	removeEvent,
	type Confirmation,
	removeParticipant,
	updateEvent,
} from "./manage";

const eventId = z.string().max(64);
const adminSecret = z.string().max(128);

/** A created event as the page needs it: the view holds Temporal values, which do not serialize. */
export type CreatedEvent =
	| { ok: true; id: string; segment: string; adminSecret: string }
	| { ok: false; problems: EventProblem[] };

export async function createEventAction(input: NewEvent): Promise<CreatedEvent> {
	const created = await createEvent(input);

	return created.ok
		? {
				ok: true,
				id: created.event.id,
				segment: created.event.segment,
				adminSecret: created.adminSecret,
			}
		: created;
}

/** The event's version for the page's check, `null` once it is gone. */
export async function eventVersionAction(id: string): Promise<EventVersion | null> {
	const args = eventId.safeParse(id);

	return args.success ? eventVersion(args.data) : null;
}

/** The event for its manage page, or `null` when the secret does not fit. */
export async function loadManageAction(id: string, secret: string): Promise<ManagedEvent | null> {
	const args = z.tuple([eventId, adminSecret]).safeParse([id, secret]);

	return args.success ? ((await readManagedEvent(...args.data)) ?? null) : null;
}

/** What the manage page learns from a change; the event itself holds values that do not serialize. */
export type UpdatedEvent =
	| { status: "saved"; segment: string }
	| { status: "denied" }
	| { status: "invalid"; problems: EventProblem[] }
	/** What the change would cost, and the version that was counted at. */
	| { status: "confirm"; losing: number; clearsFinal: boolean; version: EventVersion };

const confirmation = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("none") }),
	z.object({ kind: z.literal("version"), version: eventVersionSchema }),
]);

/** A confirmation for a version that is not current asks again, with the loss as it is now. */
export async function updateEventAction(
	id: string,
	secret: string,
	input: NewEvent,
	confirmed: Confirmation,
): Promise<UpdatedEvent> {
	const args = z.tuple([eventId, adminSecret, confirmation]).safeParse([id, secret, confirmed]);

	if (!args.success) {
		return { status: "denied" };
	}

	const [event, held, confirms] = args.data;
	const result = await updateEvent(event, held, input, { kind: "any" }, undefined, confirms);

	switch (result.status) {
		case "saved":
			return { status: "saved", segment: result.event.segment };
		case "changed":
			// Unreachable: a change for any version is never refused for its version.
			return { status: "denied" };
		case "denied":
		case "invalid":
		case "confirm":
			return result;
	}
}

/** What the manage page learns from picking or clearing the final time. */
export type FinalChange =
	| { status: "saved" }
	| { status: "denied" }
	| { status: "invalid"; problem: FinalProblem };

function finalChangeOf(result: FinalResult): FinalChange {
	switch (result.status) {
		case "saved":
			return { status: "saved" };
		case "changed":
			// Unreachable: a change for any version is never refused for its version.
			return { status: "denied" };
		case "denied":
		case "invalid":
			return result;
	}
}

/** Picks the run of `slots` as the final time; a weekday event also sends the `date`. */
export async function pickFinalAction(
	id: string,
	secret: string,
	slots: string[],
	date: string | null,
): Promise<FinalChange> {
	const args = z
		.tuple([eventId, adminSecret, z.array(z.string().max(64)).max(1000), z.iso.date().nullable()])
		.safeParse([id, secret, slots, date]);

	if (!args.success) {
		return { status: "denied" };
	}

	const [event, held, keys, day] = args.data;
	const request: FinalRequest = { slots: keys };

	if (day !== null) {
		request.date = Temporal.PlainDate.from(day);
	}

	return finalChangeOf(await pickFinal(event, held, request));
}

export async function clearFinalAction(id: string, secret: string): Promise<FinalChange> {
	const args = z.tuple([eventId, adminSecret]).safeParse([id, secret]);

	return args.success ? finalChangeOf(await clearFinal(...args.data)) : { status: "denied" };
}

export async function removeParticipantAction(
	id: string,
	secret: string,
	participantId: string,
): Promise<boolean> {
	const args = z
		.tuple([eventId, adminSecret, z.string().refine(isPublicId)])
		.safeParse([id, secret, participantId]);

	return args.success && (await removeParticipant(...args.data)).status === "removed";
}

export async function removeEventAction(id: string, secret: string): Promise<boolean> {
	const args = z.tuple([eventId, adminSecret]).safeParse([id, secret]);

	return args.success && (await removeEvent(...args.data));
}
