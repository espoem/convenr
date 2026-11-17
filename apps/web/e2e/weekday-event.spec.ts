import { expect, test } from "@playwright/test";

// Spec section 14: a weekday event keeps its times for every viewer (T3) and orders its
// columns from the event's first day of week (T4).
test("a weekday event shows stored times in every zone, from the first day of week", async ({
	browser,
}) => {
	const organizer = await browser.newContext({ locale: "cs-CZ", timezoneId: "Europe/Prague" });
	const page = await organizer.newPage();

	await page.goto("/cs");
	await page.getByLabel("Název").fill("Trénink");
	await page.getByText("Dny v týdnu").click();
	await page.getByText("po", { exact: true }).click();
	await page.getByText("ne", { exact: true }).click();
	await page.getByLabel("Týden začíná").selectOption({ label: "neděle" });
	await page.getByLabel("Každý den od").selectOption({ label: "18:00" });
	await page.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await page.getByRole("button", { name: "Vytvořit událost" }).click();
	await page.waitForURL(/\/created$/);

	const share = await page.getByLabel("Odkaz pro účastníky").inputValue();

	await organizer.close();

	const viewer = await browser.newContext({ locale: "cs-CZ", timezoneId: "America/New_York" });
	const away = await viewer.newPage();

	await away.goto(share);
	await expect(
		away.getByText("Časy jsou v pásmu Europe/Prague a nepřevádějí se na váš čas."),
	).toBeVisible();
	expect(
		await away
			.getByRole("columnheader")
			.evaluateAll((headers) => headers.map((header) => header.getAttribute("aria-label"))),
	).toEqual(["neděle", "pondělí"]);
	await expect(away.getByRole("button", { name: /^neděle, 18:00–18:30, / })).toBeVisible();
	await viewer.close();
});
