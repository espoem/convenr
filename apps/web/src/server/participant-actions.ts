"use server";
// Server Actions for joining, responding and leaving (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// The participant is the one the browser's key names (ADR 0008), so no token reaches the page.
// Results carry strings, because Temporal values do not serialize.

import { z } from "zod";

import { ensureToken, heldToken } from "./browser-key";
import {
	changePassword,
	forgetToken,
	join,
	leave,
	moveToken,
	type PasswordRefusal,
} from "./participants";
import { saveResponse } from "./responses";

const eventId = z.string().max(64);
const token = z.string().max(128);
const password = z.string().max(512).nullable();

/** A lockout's end as an ISO instant string. */
function serializable<Result extends { ok: boolean }>(result: Result | PasswordRefusal) {
	return "retryAt" in result ? { ...result, retryAt: result.retryAt.toString() } : result;
}

export async function joinAction(id: string, name: string, pass: string | null) {
	const args = z.tuple([eventId, z.string().max(400), password]).safeParse([id, name, pass]);

	if (!args.success) {
		return { ok: false, problem: "invalid_name" } as const;
	}

	const [event, displayName, given] = args.data;

	// The form has one password field, which checks a used name's password or sets a new name's.
	const joined = await join(
		event,
		displayName,
		given === null ? { kind: "none" } : { kind: "current_or_new", password: given },
		undefined,
		undefined,
		{ kind: "browser", token: await ensureToken(event) },
	);

	// The schedule holds Temporal values, which do not serialize, and the token stays on the server.
	return joined.ok ? ({ ok: true, name: joined.participant.name } as const) : serializable(joined);
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

	return (await moveToken(event, old, await ensureToken(event))) ?? null;
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

	const [event, marked, maybe] = args.data;
	const held = await heldToken(event);

	if (held === undefined) {
		return { ok: false, problem: "not_joined" } as const;
	}

	const saved = await saveResponse(event, held, { available: marked, ifNeedBe: maybe });

	// The page already shows what it saved; the schedule holds Temporal values, which do not serialize.
	return saved.ok ? ({ ok: true } as const) : saved;
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
	const held = await heldToken(event);

	if (held === undefined) {
		return { ok: false, problem: "not_joined" } as const;
	}

	return serializable(
		await changePassword(
			event,
			held,
			given === null ? { kind: "none" } : { kind: "if_set", password: given },
			wanted,
		),
	);
}

export async function leaveAction(id: string) {
	const args = eventId.safeParse(id);
	const held = args.success ? await heldToken(args.data) : undefined;

	return args.success && held !== undefined
		? leave(args.data, held)
		: ({ ok: false, problem: "not_joined" } as const);
}
