import { type Page, test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, respond } from "./helpers";

// Steps 1 to 3 of the Phase 2 acceptance test (Phase 2 spec section 10). Step 4, expiry,
// belongs to the retention rules.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

async function expectGone(page: Page, link: string) {
	await page.goto(link);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena");
}

test("the organizer narrows the hours, deletes a participant and then the event", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);

	// Step 1: an event with two participants who marked 20:00.
	const { share, admin } = await createEvent(organizer, "Zkouška kapely", first);

	await respond(browser, share, "Jana", first, ["20:00"]);
	await respond(browser, share, "Petr", first, ["20:00"]);

	// Step 2: narrowing the hours names how many participants lose availability (M5).
	await organizer.goto(admin);
	await expect(organizer.getByLabel("Délka políčka")).toBeDisabled();
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();
	await expect(
		organizer.getByRole("alert").filter({ hasText: "2 účastníci přijdou o část své dostupnosti" }),
	).toBeVisible();
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();

	const viewer = await freshPage(browser);

	await viewer.goto(share);
	await expect(cell(viewer, first, "18:30")).toBeVisible();
	await expect(cell(viewer, first, "19:00")).toHaveCount(0);
	await viewer.context().close();

	// Step 3: deleting a participant, then the event (M7, M8).
	await organizer.getByRole("button", { name: "Smazat účastníka Jana" }).click();
	await organizer.getByRole("button", { name: "Smazat účastníka", exact: true }).click();
	await expect(organizer.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible();
	await organizer.getByRole("button", { name: "Smazat událost" }).click();
	await organizer.getByRole("button", { name: "Smazat natrvalo" }).click();
	await organizer.waitForURL(/\/cs$/u);
	await expect(organizer.getByText("Zkouška kapely")).toHaveCount(0);
	await expectGone(organizer, share);
	await expectGone(organizer, admin);
	await organizer.context().close();
});
