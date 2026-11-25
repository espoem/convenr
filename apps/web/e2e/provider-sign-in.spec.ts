import { test } from "@playwright/test";

import { accountsPage } from "./accounts";
import { expect } from "./helpers";
import { emailTo, linkIn, uniqueAddress } from "./mail";
import { providerSignsIn, uniqueId } from "./providers";

// Sign-in through a provider on the main server, whose requests to the providers the test answers.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test("a provider that proves the address signs in, without scripts", async ({ browser }) => {
	const page = await accountsPage(browser, { javaScriptEnabled: false });
	const email = `jana-${uniqueId()}@gmail.com`;

	await providerSignsIn(page, { id: uniqueId(), email, verified: true });
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Continue with Google" }).click();
	await page.getByRole("link", { name: "Go back" }).click();

	await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

	await page.context().close();
});

test("an address the provider does not prove is confirmed by an email link", async ({
	browser,
}) => {
	const page = await accountsPage(browser);
	const email = uniqueAddress("petr");

	// GitHub verified the address once, which does not prove that it is still the person's.
	await providerSignsIn(page, { id: uniqueId(), email, verified: true });
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Continue with GitHub" }).click();
	await page.getByRole("link", { name: "Go back" }).click();

	await expect(page.getByRole("heading", { name: "Confirm your address" })).toBeVisible();
	expect(page.url()).not.toContain("petr");
	await expect(page.getByLabel("Email address")).toHaveValue(email);

	await page.getByRole("button", { name: "Email me a sign-in link" }).click();
	await page.goto(linkIn((await emailTo(email, "sign-in link")).Text));
	await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

	await page.context().close();
});

test("a visitor who stops at the provider returns to the sign-in page", async ({ browser }) => {
	const page = await accountsPage(browser);

	await providerSignsIn(page, "stopped");
	await page.goto("/cs/sign-in");
	await page.getByRole("button", { name: "Pokračovat přes Google" }).click();
	await page.getByRole("link", { name: "Go back" }).click();

	await expect(page.getByText("Přihlášení se nedokončilo.")).toBeVisible();
	await expect(page).toHaveURL(/\/cs\/sign-in\?problem=provider_failed$/u);

	await page.context().close();
});

test("another site cannot start a sign-in", async ({ request }) => {
	const answer = await request.post("/en/sign-in/provider", {
		form: { provider: "google" },
		headers: { origin: "https://example.org" },
	});

	expect(answer.status()).toBe(403);
});
