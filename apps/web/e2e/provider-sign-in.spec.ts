import { test } from "@playwright/test";

import { accountsPage, signIn } from "./accounts";
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

	// The link opened in the browser that signed in at GitHub, so GitHub joined the account.
	await expect(page.getByText("The service is added.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Remove GitHub" })).toBeVisible();
	await emailTo(email, "GitHub");

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Continue with GitHub" }).click();
	await page.getByRole("link", { name: "Go back" }).click();
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

test("an account adds a provider, signs in with it and removes it", async ({ browser }) => {
	const page = await accountsPage(browser);
	const address = uniqueAddress("eva");
	const person = { id: uniqueId(), email: uniqueAddress("other"), verified: false };

	await signIn(page, address);
	await providerSignsIn(page, person);
	await page.getByRole("button", { name: "Add GitHub" }).click();
	await page.getByRole("link", { name: "Go back" }).click();
	await expect(page.getByText("The service is added.")).toBeVisible();
	expect((await emailTo(address, "GitHub")).Text).not.toContain(person.email);

	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
	await page.goto("/en/sign-in");
	await page.getByRole("button", { name: "Continue with GitHub" }).click();
	await page.getByRole("link", { name: "Go back" }).click();
	await expect(page.getByText(`Signed in as ${address}`)).toBeVisible();

	await page.getByRole("button", { name: "Remove GitHub" }).click();
	await page.getByRole("button", { name: "Remove service" }).click();
	await expect(page.getByText("The service is removed.")).toBeVisible();
	await expect(page.getByRole("button", { name: "Add GitHub" })).toBeVisible();

	await page.context().close();
});

test("a provider identity of another account is refused", async ({ browser }) => {
	const person = { id: uniqueId(), email: `first-${uniqueId()}@gmail.com`, verified: true };
	const first = await accountsPage(browser);
	const second = await accountsPage(browser);

	await providerSignsIn(first, person);
	await first.goto("/en/sign-in");
	await first.getByRole("button", { name: "Continue with Google" }).click();
	await first.getByRole("link", { name: "Go back" }).click();
	await expect(first.getByText(`Signed in as ${person.email}`)).toBeVisible();

	await signIn(second, uniqueAddress("second"));

	// A callback that this browser did not start, or whose state expired, says that it failed.
	await second.goto("/api/auth/callback/github?code=x&state=lost");
	await expect(second.getByText("The service was not added.")).toBeVisible();

	await providerSignsIn(second, person);
	await second.getByRole("button", { name: "Add Google" }).click();
	await second.getByRole("link", { name: "Go back" }).click();
	await expect(
		second.getByText("This sign-in already belongs to another convenr account."),
	).toBeVisible();

	await first.context().close();
	await second.context().close();
});

test("another site cannot start a sign-in", async ({ request }) => {
	const answer = await request.post("/en/sign-in/provider", {
		form: { provider: "google", purpose: "sign_in" },
		headers: { origin: "https://example.org" },
	});

	expect(answer.status()).toBe(403);
});
