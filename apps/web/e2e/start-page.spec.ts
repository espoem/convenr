import { expect, test } from "@playwright/test";

test.describe("start page", () => {
	test("redirects to Czech when the browser asks for Czech", async ({ browser }) => {
		const context = await browser.newContext({ locale: "cs-CZ" });
		const page = await context.newPage();
		await page.goto("/");
		await expect(page).toHaveURL(/\/cs$/u);
		await expect(page.locator("html")).toHaveAttribute("lang", "cs");
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			"Najděte čas, který vyhovuje všem",
		);
		await context.close();
	});

	test("falls back to English for an unsupported language", async ({ browser }) => {
		const context = await browser.newContext({ locale: "de-DE" });
		const page = await context.newPage();
		await page.goto("/");
		await expect(page).toHaveURL(/\/en$/u);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(
			"Find a time that works for everyone",
		);
		await context.close();
	});

	test("switches language and stays on the start page", async ({ page }) => {
		await page.goto("/en");
		await page.getByLabel("Language: English").click();
		await page
			.getByRole("navigation", { name: "Language" })
			.getByRole("link", { name: "Čeština" })
			.click();
		await expect(page).toHaveURL(/\/cs$/u);
		await page.getByLabel("Jazyk: Čeština").click();
		await expect(
			page.getByRole("navigation", { name: "Jazyk" }).getByRole("link", { name: "Čeština" }),
		).toHaveAttribute("aria-current", "true");
	});

	test("keeps the header in place when the language changes", async ({ page }) => {
		await page.goto("/cs");

		const before = await page.getByLabel("Vzhled: Podle systému").boundingBox();

		await page.getByLabel("Jazyk: Čeština").click();
		await page.getByRole("link", { name: "English" }).click();
		await expect(page).toHaveURL(/\/en$/u);

		const after = await page.getByLabel("Appearance: System").boundingBox();

		expect(after?.x).toBe(before?.x);
	});

	test("keeps a chosen theme without JavaScript", async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
		const page = await context.newPage();
		await page.goto("/en");
		await page.getByLabel("Appearance: System").click();
		await page.getByRole("button", { name: "Dark" }).click();
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

		// The server renders the choice, so a fresh page starts dark before any script runs.
		await page.goto("/en");
		const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(background).toBe("rgb(27, 22, 18)");

		await page.getByLabel("Appearance: Dark").click();
		await page.getByRole("button", { name: "System", exact: true }).click();
		await expect(page.locator("html")).not.toHaveAttribute("data-theme");
		await context.close();
	});

	test("follows the device in the dark", async ({ browser }) => {
		const context = await browser.newContext({ colorScheme: "dark" });
		const page = await context.newPage();
		await page.goto("/en");
		const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(background).toBe("rgb(27, 22, 18)");
		await context.close();
	});

	test("does not scroll sideways", async ({ page }) => {
		await page.goto("/cs");

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		);

		expect(overflow).toBeLessThanOrEqual(0);
	});

	test("applies the theme from DESIGN.md", async ({ page }) => {
		await page.goto("/en");
		const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
		expect(background).toBe("rgb(250, 246, 238)");
	});

	test("shows a localized page for an unknown address", async ({ page }) => {
		const response = await page.goto("/cs/neexistuje");
		expect(response?.status()).toBe(404);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena");
	});
});
