// The providers' own pages in end-to-end tests: they send the browser straight back.
import type { Page } from "@playwright/test";

export type Person = { id: string; email: string; verified: boolean };

/** A provider identity no other test uses; GitHub's are numbers. */
export function uniqueId(): string {
	return String(crypto.getRandomValues(new Uint32Array(1))[0]);
}

/** The provider's page signs in as `person`, or the visitor stops there. */
export async function providerSignsIn(page: Page, person: Person | "stopped"): Promise<void> {
	await page.route(/^https:\/\/(?:accounts\.google\.com|github\.com)\//u, async (route) => {
		const asked = new URL(route.request().url());
		const back = new URL(asked.searchParams.get("redirect_uri") ?? "");

		back.searchParams.set("state", asked.searchParams.get("state") ?? "");

		if (person === "stopped") {
			back.searchParams.set("error", "access_denied");
		} else {
			back.searchParams.set("code", Buffer.from(JSON.stringify(person)).toString("base64url"));
		}

		await route.fulfill({
			contentType: "text/html",
			body: `<a href="${back.href.replaceAll("&", "&amp;")}">Go back</a>`,
		});
	});
}
