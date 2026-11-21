import { type Browser, type Page, test } from "@playwright/test";

import { expect } from "./helpers";
import { emailTo, linkIn, uniqueAddress } from "./mail";
import { ACCOUNTS_BASE_URL, POLL_BASE_URL } from "./servers";

// Accounts on the main server: an email link read from Mailpit signs a browser in, the account
// page lists its passkeys and browsers, and a virtual authenticator signs in with a passkey.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

async function accountsPage(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		baseURL: ACCOUNTS_BASE_URL,
		locale: "en-GB",
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});

	return context.newPage();
}

/** Asks for a sign-in link for `address` and follows it. */
async function signIn(page: Page, address: string): Promise<void> {
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

test("an email link signs in, and the account lists the browser and signs out", async ({
	browser,
}) => {
	const page = await accountsPage(browser);
	const address = uniqueAddress("jana");

	await signIn(page, address);
	await expect(page.getByText("This browser")).toBeVisible();

	// The link works once.
	const used = linkIn((await emailTo(address, "sign-in link")).Text);

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	await page.goto(used);
	await expect(page.getByText("This sign-in link is used, expired or incomplete.")).toBeVisible();

	await page.context().close();
});

test("a passkey added after the email link signs in alone", async ({ browser }) => {
	const page = await accountsPage(browser);
	const session = await page.context().newCDPSession(page);

	await session.send("WebAuthn.enable");
	await session.send("WebAuthn.addVirtualAuthenticator", {
		options: {
			protocol: "ctap2",
			transport: "internal",
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
		},
	});

	await signIn(page, uniqueAddress("petr"));
	await page.getByRole("button", { name: "Add a passkey" }).click();
	await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();

	await page.getByRole("button", { name: "Sign out" }).click();
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Sign in with a passkey" }).click();
	await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();

	await page.context().close();
});

test("an instance without accounts shows no sign-in", async ({ page }) => {
	// The second server has no mail settings, so accounts are off there.
	await page.goto(`${POLL_BASE_URL}/en`);
	await expect(page.getByRole("link", { name: "convenr" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
	expect((await page.request.get(`${POLL_BASE_URL}/en/sign-in`)).status()).toBe(404);
	expect((await page.request.get(`${POLL_BASE_URL}/api/auth/get-session`)).status()).toBe(404);
});
