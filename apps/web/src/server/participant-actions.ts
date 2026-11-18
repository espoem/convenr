"use server";
// Server Actions for joining, responding and leaving (ADR 0001). A browser can send anything,
// so each action checks the shape of its arguments; the data access layer applies the rules.
// Results carry strings, because Temporal values do not serialize.

import { z } from "zod";

import { changePassword, identify, join, leave, type PasswordRefusal } from "./participants";
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
	);

	// The page needs the name and the token; the schedule holds Temporal values, which do not serialize.
	return joined.ok
		? ({ ok: true, name: joined.participant.name, token: joined.token } as const)
		: serializable(joined);
}

export async function identifyAction(id: string, held: string) {
	const args = z.tuple([eventId, token]).safeParse([id, held]);

	return args.success ? ((await identify(...args.data)) ?? null) : null;
}

export async function saveAction(id: string, held: string, keys: string[]) {
	const args = z
		.tuple([eventId, token, z.array(z.string().max(40)).max(10_000)])
		.safeParse([id, held, keys]);

	if (!args.success) {
		return { ok: false, problem: "unknown_slot" } as const;
	}

	const saved = await saveResponse(...args.data);

	// The page already shows what it saved; the schedule holds Temporal values, which do not serialize.
	return saved.ok ? ({ ok: true } as const) : saved;
}

export async function changePasswordAction(
	id: string,
	held: string,
	current: string | null,
	next: string | null,
) {
	const args = z.tuple([eventId, token, password, password]).safeParse([id, held, current, next]);

	if (!args.success) {
		return { ok: false, problem: "invalid_password" } as const;
	}

	const [event, holder, given, wanted] = args.data;

	return serializable(
		await changePassword(
			event,
			holder,
			given === null ? { kind: "none" } : { kind: "if_set", password: given },
			wanted,
		),
	);
}

export async function leaveAction(id: string, held: string) {
	const args = z.tuple([eventId, token]).safeParse([id, held]);

	return args.success ? leave(...args.data) : ({ ok: false, problem: "not_joined" } as const);
}
