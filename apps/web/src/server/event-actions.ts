"use server";
// Server Actions for creating and managing an event (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The admin secret travels in the request body, never in an address (ADR 0003 item 2).

import { z } from "zod";

import { isPublicId } from "@/domain/public-id";
import { type EventVersion, eventVersionSchema } from "@/lib/event-version";

import { createEvent, type EventProblem, eventVersion, type NewEvent } from "./events";
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
	/** How many participants would lose availability, and the version that count was taken at. */
	| { status: "confirm"; losing: number; version: EventVersion };

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
