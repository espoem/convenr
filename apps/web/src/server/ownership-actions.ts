"use server";
// Adding the events this browser knows to the signed-in account, and unlinking a participant
// from it. The admin secret travels in the request body, never in an address (ADR 0003 item 2);
// the participant is the one the browser's key names (ADR 0008).

import { z } from "zod";

import { ensureToken, heldToken } from "./browser-key";
import { type ClaimResult, claimEvent } from "./ownership";
import { type LinkResult, linkHeld, unlink } from "./participants";
import { currentVisitor } from "./session";

const eventId = z.string().max(64);

export type ClaimOutcome = ClaimResult["status"] | "signed_out";

/** Makes the account the owner of the event this browser organizes. */
export async function claimEventAction(id: string, secret: string): Promise<ClaimOutcome> {
	const args = z.tuple([eventId, z.string().max(128)]).safeParse([id, secret]);
	const visitor = await currentVisitor();

	if (visitor.kind !== "signed_in") {
		return "signed_out";
	}

	if (!args.success) {
		return "wrong_admin_secret";
	}

	return (await claimEvent(args.data[0], args.data[1], visitor.accountId)).status;
}

export type LinkOutcome = LinkResult["status"] | "signed_out";

/** Links the participant this browser joined the event as to the account. */
export async function linkParticipantAction(id: string): Promise<LinkOutcome> {
	const args = eventId.safeParse(id);
	const visitor = await currentVisitor();

	if (visitor.kind !== "signed_in") {
		return "signed_out";
	}

	const held = args.success ? await heldToken(args.data) : undefined;

	return args.success && held !== undefined
		? (await linkHeld(args.data, held, visitor.accountId)).status
		: "not_joined";
}

/** Unlinks the account's participant in the event; this browser stays joined as it. */
export async function unlinkAction(id: string): Promise<boolean> {
	const args = eventId.safeParse(id);
	const visitor = await currentVisitor();

	return (
		args.success &&
		visitor.kind === "signed_in" &&
		(await unlink(args.data, visitor.accountId, await ensureToken(args.data)))
	);
}
