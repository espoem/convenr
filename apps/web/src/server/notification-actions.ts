"use server";
// The per-event notification choices of a signed-in account, and the unsubscribe form, which
// needs no sign-in because the signed value in its link names what it turns off.

import { z } from "zod";

import { db } from "@/db/client";
import { NOTIFICATION_KINDS } from "@/domain/notifications";
import { redirect } from "@/i18n/navigation";
import { localeSchema } from "@/i18n/routing";
import { formText as text } from "@/lib/form-text";

import { eventChoices, setEventChoice, unsubscribe } from "./notifications";
import { currentVisitor } from "./session";

const choiceSchema = z.tuple([
	z.string().max(64),
	z.enum(NOTIFICATION_KINDS),
	z.enum(["account", "on", "off"]),
]);

/** Sets the account's choice of one kind for event `id`; only a kind that is for it there. */
export async function setEventChoiceAction(
	id: string,
	kind: string,
	choice: string,
): Promise<boolean> {
	const args = choiceSchema.safeParse([id, kind, choice]);
	const visitor = await currentVisitor();

	if (!args.success || visitor.kind !== "signed_in") {
		return false;
	}

	const [eventId, chosenKind, chosen] = args.data;
	const offered = await eventChoices(visitor.accountId, eventId);

	if (!offered.some((entry) => entry.kind === chosenKind)) {
		return false;
	}

	await setEventChoice(db(), visitor.accountId, eventId, chosenKind, chosen);

	return true;
}

/** Turns off what the form's signed value names, and shows the page again with the outcome. */
export async function unsubscribeAction(form: FormData): Promise<void> {
	const locale = localeSchema.parse(text(form, "locale"));
	const value = text(form, "value");
	const result = await unsubscribe(value);

	// The value stays in the address so the confirmation can name the event.
	redirect({
		href: {
			pathname: "/unsubscribe",
			query: result.status === "unsubscribed" ? { value, done: "1" } : { problem: "invalid" },
		},
		locale,
	});
}
