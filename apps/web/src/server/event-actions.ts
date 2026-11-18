"use server";
// Server Actions for creating and managing an event (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The admin secret travels in the request body, never in an address (ADR 0003 item 2).

import { z } from "zod";

import { isPublicId } from "@/domain/public-id";

import { createEvent, type EventProblem, eventVersion, type NewEvent } from "./events";
import {
	type ManagedEvent,
	readManagedEvent,
	removeEvent,
	removeParticipant,
	type UpdateEventResult,
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
export async function eventVersionAction(id: string): Promise<string | null> {
	const args = eventId.safeParse(id);

	return args.success ? eventVersion(args.data) : null;
}

/** The event for its manage page, or `null` when the secret does not fit. */
export async function loadManageAction(id: string, secret: string): Promise<ManagedEvent | null> {
	const args = z.tuple([eventId, adminSecret]).safeParse([id, secret]);

	return args.success ? ((await readManagedEvent(...args.data)) ?? null) : null;
}

export async function updateEventAction(
	id: string,
	secret: string,
	input: NewEvent,
	confirmedLosing: number | null,
): Promise<UpdateEventResult> {
	const args = z
		.tuple([eventId, adminSecret, z.int().min(0).max(100).nullable()])
		.safeParse([id, secret, confirmedLosing]);

	if (!args.success) {
		return { status: "denied" };
	}

	const [event, held, confirmed] = args.data;

	return updateEvent(event, held, input, confirmed);
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
