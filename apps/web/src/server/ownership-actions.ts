"use server";
// Adding an event this browser organizes to the signed-in account. The admin secret travels in
// the request body, never in an address (ADR 0003 item 2).

import { z } from "zod";

import { type ClaimResult, claimEvent } from "./ownership";
import { currentVisitor } from "./session";

export type ClaimOutcome = ClaimResult["status"] | "signed_out";

export async function claimEventAction(id: string, secret: string): Promise<ClaimOutcome> {
	const args = z.tuple([z.string().max(64), z.string().max(128)]).safeParse([id, secret]);
	const visitor = await currentVisitor();

	if (visitor.kind !== "signed_in") {
		return "signed_out";
	}

	if (!args.success) {
		return "wrong_admin_secret";
	}

	return (await claimEvent(args.data[0], args.data[1], visitor.accountId)).status;
}
