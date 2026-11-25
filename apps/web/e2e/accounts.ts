// Browsers on the main server, where accounts are on, and signing them in with a link from
// Mailpit.
import { type Browser, type BrowserContextOptions, type Page, test } from "@playwright/test";

import { expect } from "./helpers";
import { emailTo, linkIn } from "./mail";
import { ACCOUNTS_BASE_URL } from "./servers";

/** A new browser on the main server using the active project's viewport and touch capability. */
export async function accountsPage(
	browser: Browser,
	options: BrowserContextOptions = {},
): Promise<Page> {
	const { viewport, hasTouch } = test.info().project.use;

	const context = await browser.newContext({
		...options,
		baseURL: ACCOUNTS_BASE_URL,
		locale: "en-GB",
		timezoneId: "Europe/Prague",
		viewport: viewport ?? { width: 390, height: 844 },
		hasTouch: hasTouch ?? true,
	});

	return context.newPage();
}

/** Asks for a sign-in link for `address` and follows it. */
export async function signIn(page: Page, address: string): Promise<void> {
	await page.goto("/en/sign-in");
	await page.getByLabel("Email address").fill(address);
	await page.getByRole("button", { name: "Email me a sign-in link" }).click();
	await expect(page.getByText("If the address is right, a link is on its way.")).toBeVisible();

	const email = await emailTo(address, "sign-in link");

	expect(email.HTML).not.toMatch(/<img|(?:href|src)="https?:\/\/(?!localhost)/u);
	await page.goto(linkIn(email.Text));
	await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
	await expect(page.getByText(`Signed in as ${address}`)).toBeVisible();
}
