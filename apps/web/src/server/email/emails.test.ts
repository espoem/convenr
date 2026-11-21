import { describe, expect, it } from "vitest";

import { emailChangeNotice, signInEmail } from "./emails";
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
