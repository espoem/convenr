"use server";
// Server Actions for joining, responding and leaving (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The participant is the signed-in account's, or the one the browser's key names (ADR 0008),
// so no token reaches the page. Results carry strings, because Temporal values do not serialize.

import { z } from "zod";

import { heldToken, prepareToken } from "./browser-key";
import { currentHolder } from "./holder";
import { sendSoon } from "./outbox";
import {
	changePassword,
	forgetToken,
	join,
	type JoinPassword,
	joinLinked,
	leave,
	moveToken,
	type PasswordRefusal,
} from "./participants";
import { saveResponse } from "./responses";
import { currentVisitor } from "./session";

const eventId = z.string().max(64);
const token = z.string().max(128);
const password = z.string().max(512).nullable();

/** A lockout's end as an ISO instant string. */
function serializable<Result extends { ok: boolean }>(result: Result | PasswordRefusal) {
	return "retryAt" in result ? { ...result, retryAt: result.retryAt.toString() } : result;
}

/**
 * A signed-in visitor joins as the account (ADR 0009): the browser gets no token, and a token
 * it held for the event is retired, so signing out leaves no access behind.
 */
export async function joinAction(id: string, name: string, pass: string | null) {
	const args = z.tuple([eventId, z.string().max(400), password]).safeParse([id, name, pass]);

	if (!args.success) {
		return { ok: false, problem: "invalid_name" } as const;
	}

	const [event, displayName, given] = args.data;

	// The form has one password field, which checks a used name's password or sets a new name's.
	const asked: JoinPassword =
		given === null ? { kind: "none" } : { kind: "current_or_new", password: given };

	const visitor = await currentVisitor();

	if (visitor.kind === "signed_in") {
		const joined = await joinLinked(event, displayName, asked, visitor.accountId);

		if (!joined.ok) {
			return serializable(joined);
		}

		sendSoon();

		const held = await heldToken(event);

		if (held !== undefined) {
			await forgetToken(event, held);
		}

		return {
			ok: true,
			name: joined.participant.name,
			hasPassword: joined.hasPassword,
			linked: true,
		} as const;
	}

	const prepared = await prepareToken(event);

	const joined = await join(event, displayName, asked, undefined, undefined, {
		kind: "browser",
		token: prepared.token,
	});

	if (!joined.ok) {
		return serializable(joined);
	}

	await prepared.commit();
	sendSoon();

	// The schedule holds Temporal values, which do not serialize, and the token stays on the server.
	return {
		ok: true,
		name: joined.participant.name,
		hasPassword: joined.hasPassword,
		linked: false,
	} as const;
}

/**
 * Moves a participant token that local storage kept before ADR 0008 to the browser's key.
 * Answers the participant's name, or `null` when the token is unknown.
 */
export async function moveTokenAction(id: string, held: string) {
	const args = z.tuple([eventId, token]).safeParse([id, held]);

	if (!args.success) {
		return null;
	}

	const [event, old] = args.data;
	const prepared = await prepareToken(event);
	const moved = await moveToken(event, old, prepared.token);

	if (moved === undefined) {
		return null;
	}

	await prepared.commit();

	return moved;
}

/** "Not you?": the browser stops opening the event as this participant; the participant stays. */
export async function forgetAction(id: string) {
	const args = eventId.safeParse(id);
	const held = args.success ? await heldToken(args.data) : undefined;

	if (args.success && held !== undefined) {
		await forgetToken(args.data, held);
	}
}

const slotKeys = z.array(z.string().max(40)).max(10_000);

/** Saves every slot in `available`, those also in `ifNeedBe` at if need be. */
export async function saveAction(id: string, available: string[], ifNeedBe: string[]) {
	const args = z.tuple([eventId, slotKeys, slotKeys]).safeParse([id, available, ifNeedBe]);

	if (!args.success) {
		return { ok: false, problem: "unknown_slot" } as const;
	}

	const [event, markedAvailable, markedIfNeedBe] = args.data;
	const holder = await currentHolder(event);

	if (holder === undefined) {
		return { ok: false, problem: "not_joined" } as const;
	}

	const saved = await saveResponse(event, holder, {
		available: markedAvailable,
		ifNeedBe: markedIfNeedBe,
	});

	if (!saved.ok) {
		return saved;
	}

	sendSoon();

	// The page already shows what it saved; the schedule holds Temporal values, which do not serialize.
	return { ok: true } as const;
}

export async function changePasswordAction(
	id: string,
	current: string | null,
	next: string | null,
) {
	const args = z.tuple([eventId, password, password]).safeParse([id, current, next]);

	if (!args.success) {
		return { ok: false, problem: "invalid_password" } as const;
	}

	const [event, given, wanted] = args.data;
	const holder = await currentHolder(event);

	if (holder === undefined || holder.kind === "account") {
		return { ok: false, problem: "not_joined" } as const;
	}

	return serializable(
		await changePassword(
			event,
			holder,
			given === null ? { kind: "none" } : { kind: "if_set", password: given },
			wanted,
		),
	);
}

export async function leaveAction(id: string) {
	const args = eventId.safeParse(id);
	const holder = args.success ? await currentHolder(args.data) : undefined;

	return args.success && holder !== undefined
		? leave(args.data, holder)
		: ({ ok: false, problem: "not_joined" } as const);
}
