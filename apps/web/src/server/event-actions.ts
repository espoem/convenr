"use server";
// Server Actions for creating and managing an event (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The admin secret travels in the request body, never in an address (ADR 0003 item 2); the owner
// sends no secret, and the session names the account.

import { z } from "zod";

import type { FinalProblem, FinalRequest } from "@/domain/final-time";
import { isPublicId } from "@/domain/public-id";
import { type EventVersion, eventVersionSchema } from "@/lib/event-version";
import { type ManageCredential, manageCredentialSchema } from "@/lib/manage-credential";

import { createEvent, type EventProblem, eventVersion, type NewEvent } from "./events";
import { clearFinal, type FinalResult, pickFinal } from "./final";
import {
	type AdminAccess,
	type ManagedEvent,
	readManagedEvent,
	removeEvent,
	type Confirmation,
	removeParticipant,
	updateEvent,
} from "./manage";
import { sendSoon } from "./outbox";
import { currentVisitor } from "./session";

const eventId = z.string().max(64);

/** The access a credential gives, or `undefined` for an owner credential without a session. */
async function accessOf(credential: ManageCredential): Promise<AdminAccess | undefined> {
	if (credential.kind === "secret") {
		return credential;
	}

	const visitor = await currentVisitor();

	return visitor.kind === "signed_in" ? { kind: "owner", accountId: visitor.accountId } : undefined;
}

/** The event id and the access of a manage action's first two arguments, or `undefined`. */
async function parsed(
	id: string,
	credential: ManageCredential,
): Promise<{ event: string; access: AdminAccess } | undefined> {
	const args = z.tuple([eventId, manageCredentialSchema]).safeParse([id, credential]);
	const access = args.success ? await accessOf(args.data[1]) : undefined;

	return args.success && access !== undefined ? { event: args.data[0], access } : undefined;
}

/** A created event as the page needs it: the view holds Temporal values, which do not serialize. */
export type CreatedEvent =
	| { ok: true; id: string; segment: string; adminSecret: string }
	| { ok: false; problems: EventProblem[] };

/** A signed-in organizer's event belongs to the account from the start. */
export async function createEventAction(input: NewEvent): Promise<CreatedEvent> {
	const visitor = await currentVisitor();

	const created = await createEvent(
		input,
		undefined,
		visitor.kind === "signed_in" ? { kind: "account", accountId: visitor.accountId } : undefined,
	);

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

/** The event for its manage page, or `null` when the credential does not fit. */
export async function loadManageAction(
	id: string,
	credential: ManageCredential,
): Promise<ManagedEvent | null> {
	const args = await parsed(id, credential);

	return args === undefined ? null : ((await readManagedEvent(args.event, args.access)) ?? null);
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
	credential: ManageCredential,
	input: NewEvent,
	confirmed: Confirmation,
): Promise<UpdatedEvent> {
	const args = await parsed(id, credential);
	const confirms = confirmation.safeParse(confirmed);

	if (args === undefined || !confirms.success) {
		return { status: "denied" };
	}

	const result = await updateEvent(
		args.event,
		args.access,
		input,
		{ kind: "any" },
		undefined,
		confirms.data,
	);

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
	credential: ManageCredential,
	slots: string[],
	date: string | null,
): Promise<FinalChange> {
	const args = await parsed(id, credential);

	const window = z
		.tuple([z.array(z.string().max(64)).max(1000), z.iso.date().nullable()])
		.safeParse([slots, date]);

	if (args === undefined || !window.success) {
		return { status: "denied" };
	}

	const [keys, day] = window.data;
	const request: FinalRequest = { slots: keys };

	if (day !== null) {
		request.date = Temporal.PlainDate.from(day);
	}

	const picked = await pickFinal(args.event, args.access, request);

	sendSoon();

	return finalChangeOf(picked);
}

export async function clearFinalAction(
	id: string,
	credential: ManageCredential,
): Promise<FinalChange> {
	const args = await parsed(id, credential);

	if (args === undefined) {
		return { status: "denied" };
	}

	const cleared = await clearFinal(args.event, args.access);

	sendSoon();

	return finalChangeOf(cleared);
}

export async function removeParticipantAction(
	id: string,
	credential: ManageCredential,
	participantId: string,
): Promise<boolean> {
	const args = await parsed(id, credential);
	const participant = z.string().refine(isPublicId).safeParse(participantId);

	return (
		args !== undefined &&
		participant.success &&
		(await removeParticipant(args.event, args.access, participant.data)).status === "removed"
	);
}

export async function removeEventAction(
	id: string,
	credential: ManageCredential,
): Promise<boolean> {
	const args = await parsed(id, credential);

	return args !== undefined && (await removeEvent(args.event, args.access));
}
