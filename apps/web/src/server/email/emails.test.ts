import { describe, expect, it } from "vitest";

import { emailChangeNotice, notificationEmail, signInEmail } from "./emails";
import { emailTokens } from "./tokens";

const link = "https://convenr.example.org/api/auth/magic-link/verify?token=abc&callbackURL=%2Fcs";

describe("an email", () => {
	it("holds the link in both parts, in the account's language", async () => {
		const email = await signInEmail("cs", "jana@example.org", link);

		expect(email.to).toBe("jana@example.org");
		expect(email.text).toContain(link);
		expect(email.html).toContain(`href="${link.replace("&", "&amp;")}"`);
		expect(email.html).toContain('lang="cs"');
	});

	it("uses the colors of the design and loads nothing from another host", async () => {
		const { html } = await signInEmail("en", "jana@example.org", link);

		expect(html).toContain(emailTokens.color.action);
		expect(html).toContain(emailTokens.color.background);
		expect(html).not.toMatch(/<img|@import|<link\b|<script/iu);

		const hosts = new Set(
			[...html.matchAll(/(?:href|src)="(https?:\/\/[^/"]+)/gu)].map((match) => match[1]),
		);

		expect([...hosts]).toEqual(["https://convenr.example.org"]);
	});

	it("shows what a visitor wrote as text, not markup", async () => {
		const { html, text } = await emailChangeNotice(
			"en",
			"jana@example.org",
			"<b>x</b>@example.org",
		);

		expect(html).not.toContain("<b>x</b>");
		expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
		expect(text).toContain("<b>x</b>@example.org");
	});
});

describe("a notification", () => {
	const context = {
		locale: "en" as const,
		to: "jana@example.org",
		event: {
			name: "<i>Committee</i>",
			referenceZone: "Europe/Prague",
			shareUrl: "https://convenr.example.org/e/AbCdEf",
		},
		unsubscribe: {
			page: "https://convenr.example.org/en/unsubscribe?value=v.s",
			oneClick: "https://convenr.example.org/api/unsubscribe?value=v.s",
		},
		calendar: null,
	};

	it("names the responses and links the event and the unsubscribe page in both parts", async () => {
		const email = await notificationEmail(context, { kind: "responses", names: ["Jana", "Petr"] });

		expect(email.text).toContain("Jana and Petr");
		expect(email.text).toContain(context.event.shareUrl);
		expect(email.text).toContain(context.unsubscribe.page);
		expect(email.html).toContain(context.unsubscribe.page.replace("&", "&amp;"));
		expect(email.html).not.toContain("<i>Committee</i>");
		expect(email.attachments).toBeUndefined();
	});

	it("offers one-click unsubscribing in its headers and loads nothing from another host", async () => {
		const email = await notificationEmail(
			{ ...context, calendar: { filename: "event.ics", content: "BEGIN:VCALENDAR" } },
			{
				kind: "final",
				final: {
					kind: "chosen",
					start: "2027-04-05T15:00:00Z",
					end: "2027-04-05T16:00:00Z",
					sequence: 1,
				},
			},
		);

		expect(email.headers).toEqual({
			"List-Unsubscribe": `<${context.unsubscribe.oneClick}>`,
			"List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
		});
		// 15:00 UTC is 17:00 in Prague.
		expect(email.text).toContain("5:00 PM–6:00 PM (Europe/Prague)");
		expect(email.attachments?.[0]?.contentType).toContain("text/calendar");

		const hosts = new Set(
			[...email.html.matchAll(/(?:href|src)="(https?:\/\/[^/"]+)/gu)].map((match) => match[1]),
		);

		expect([...hosts]).toEqual(["https://convenr.example.org"]);
	});
});
