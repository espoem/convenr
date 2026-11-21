import { type Browser, type Page, test } from "@playwright/test";

import { createEvent, expect, joinIn } from "./helpers";
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

test("an organizer adds an event to the account and manages it from another browser", async ({
	browser,
}) => {
	const address = uniqueAddress("organizer");
	const here = await accountsPage(browser);
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });

	// Created before signing in, so the account learns of it only when it is added.
	await createEvent(here, "Porada", first);
	await signIn(here, address);

	const inBrowser = here.getByRole("region", { name: "Events in this browser" });

	await inBrowser.getByRole("button", { name: "Add to account" }).click();
	await expect(inBrowser).toHaveCount(0);
	await expect(
		here.getByRole("region", { name: "Events I organize" }).getByRole("link", { name: "Porada" }),
	).toBeVisible();

	// Another browser, signed in to the same account, has neither the admin link nor the secret.
	const there = await accountsPage(browser);

	await signIn(there, address);
	await there.getByRole("link", { name: "Porada" }).click();
	await there.getByRole("link", { name: "Manage the event" }).click();
	await expect(there.getByRole("heading", { name: /Porada/u, level: 1 })).toBeVisible();
	await expect(there.getByRole("button", { name: "Save changes" })).toBeVisible();

	// An event created while signed in belongs to the account at once.
	await createEvent(there, "Oběd", first);
	await there.goto("/en/account");
	await expect(
		there.getByRole("region", { name: "Events I organize" }).getByRole("link", { name: "Oběd" }),
	).toBeVisible();
	await expect(there.getByRole("region", { name: "Events in this browser" })).toHaveCount(0);

	// The owner keeps the event, and releasing it from the account ends the keeping.
	const organized = there.getByRole("region", { name: "Events I organize" });

	await organized
		.getByRole("listitem")
		.filter({ hasText: "Oběd" })
		.getByRole("link", { name: "Manage" })
		.click();

	const keep = there.getByRole("button", { name: "Keep without a time limit" });

	await keep.click();
	await expect(keep).toHaveAttribute("aria-pressed", "true");
	await there.getByRole("link", { name: "Open the event" }).click();
	await expect(there.getByText("the organizer keeps the event")).toBeVisible();

	await there.goto("/en/account");
	await expect(organized.getByRole("listitem").filter({ hasText: "Oběd" })).toContainText(
		"you keep it",
	);
	await organized
		.getByRole("listitem")
		.filter({ hasText: "Oběd" })
		.getByRole("button", { name: "Remove from account" })
		.click();
	await expect(organized.getByRole("link", { name: "Oběd" })).toHaveCount(0);

	await here.context().close();
	await there.context().close();
});

test("a signed-in participant is joined in every signed-in browser until it is removed", async ({
	browser,
}) => {
	const address = uniqueAddress("participant");
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await accountsPage(browser);
	const { share } = await createEvent(organizer, "Výlet", first);
	const here = await accountsPage(browser);

	await signIn(here, address);
	await joinIn(here, share, "Eva");
	// The account's participant is not this browser's, so "Not you?" does not apply.
	await expect(here.getByRole("button", { name: "Nejste Eva?" })).toHaveCount(0);

	const there = await accountsPage(browser);

	await signIn(there, address);
	await there.goto(share);
	await expect(there.getByText("Vyplňujete jako Eva")).toBeVisible();

	// Removing it from the account keeps this browser joined, now by its own token.
	await here.goto("/en/account");

	const joined = here.getByRole("region", { name: "Events I joined" });

	await expect(joined.getByText("as Eva")).toBeVisible();
	await joined.getByRole("button", { name: "Remove from account" }).click();
	await expect(joined.getByText("You have not joined any event")).toBeVisible();
	await here.goto(share);
	await expect(here.getByRole("button", { name: "Nejste Eva?" })).toBeVisible();

	// The browser's own participant is added back from the account page.
	await here.goto("/en/account");
	await here
		.getByRole("region", { name: "Events in this browser" })
		.getByRole("button", { name: "Add to account" })
		.click();
	await expect(joined.getByText("as Eva")).toBeVisible();

	await organizer.context().close();
	await here.context().close();
	await there.context().close();
});

test("an instance without accounts shows no sign-in", async ({ page }) => {
	// The second server has no mail settings, so accounts are off there.
	await page.goto(`${POLL_BASE_URL}/en`);
	await expect(page.getByRole("link", { name: "convenr" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
	expect((await page.request.get(`${POLL_BASE_URL}/en/sign-in`)).status()).toBe(404);
	expect((await page.request.get(`${POLL_BASE_URL}/api/auth/get-session`)).status()).toBe(404);
});
