import { test } from "@playwright/test";

import { expect } from "./helpers";

test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test("every page links to the privacy page, which names the operator", async ({ page }) => {
	await page.goto("/cs");
	await page.getByRole("contentinfo").getByRole("link", { name: "Ochrana soukromí" }).click();

	await expect(page.getByRole("heading", { name: "Ochrana soukromí", level: 1 })).toBeVisible();
	await expect(page.getByText("Službu provozuje Jana Nováková")).toBeVisible();
	await expect(page.getByRole("link", { name: "privacy@example.org" }).first()).toHaveAttribute(
		"href",
		"mailto:privacy@example.org",
	);
});
