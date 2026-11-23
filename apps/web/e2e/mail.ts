import { z } from "zod";

import { expect } from "./helpers";
import { MAILPIT_URL } from "./servers";

const searchSchema = z.object({
	messages: z.array(z.object({ ID: z.string(), Subject: z.string() })),
});

const messageSchema = z.object({
	ID: z.string(),
	Text: z.string(),
	HTML: z.string(),
	Attachments: z.array(z.object({ PartID: z.string(), FileName: z.string() })),
});

/** The text of an attachment of the email with Mailpit id `id`. */
export async function attachmentText(id: string, partId: string): Promise<string> {
	const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}/part/${partId}`);

	return response.text();
}

/** An address no other test uses, so tests that run at once read only their own mail. */
export function uniqueAddress(name: string): string {
	return `${name}-${crypto.randomUUID()}@example.org`;
}

/** The newest email to `address` whose subject contains `subject`, waiting until it arrives. */
export async function emailTo(address: string, subject: string) {
	let found: { ID: string } | undefined;

	await expect
		.poll(async () => {
			const response = await fetch(
				`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
			);

			const { messages } = searchSchema.parse(await response.json());

			found = messages.find((message) => message.Subject.includes(subject));

			return found !== undefined;
		})
		.toBe(true);

	const response = await fetch(`${MAILPIT_URL}/api/v1/message/${found?.ID ?? ""}`);

	return messageSchema.parse(await response.json());
}

/** The first link to the instance in an email's text. */
export function linkIn(text: string): string {
	const link = /https?:\/\/\S+/u.exec(text)?.[0];

	if (link === undefined) {
		throw new Error(`The email holds no link:\n${text}`);
	}

	return link;
}
