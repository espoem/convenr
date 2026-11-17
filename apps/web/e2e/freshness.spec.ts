import { test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, joinAs, mark } from "./helpers";

// The version check (Phase 2 rules F1 to F4). A check runs every 15 seconds, so each change
// must show within one interval plus the time to load the page again.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

const INTERVAL = { timeout: 25_000 };

test("an open page shows other people's changes and keeps its own unsaved edits", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share, admin } = await createEvent(organizer, "Živá událost", first);
	const jana = await joinAs(browser, share, "Jana");

	// Jana's unsaved edit stays while Petr's save appears without a reload (F1 to F3).
	await mark(jana, first, ["18:00", "20:30"]);

	const petr = await joinAs(browser, share, "Petr");

	await mark(petr, first, ["20:00"]);
	await petr.getByRole("button", { name: "Uložit" }).click();
	await expect(petr.getByText("Uloženo.")).toBeVisible();
	await petr.context().close();

	await expect(jana.getByRole("heading", { name: "Účastníci (2)" })).toBeVisible(INTERVAL);
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(jana.getByRole("button", { name: "Uložit" })).toBeEnabled();

	// The organizer ends the day at 19:00: Jana's edit at 20:30 drops out and her page says so,
	// while the one at 18:00 stays (F3).
	await organizer.goto(admin);
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();
	await expect(jana.getByText("Pořadatel mezitím změnil dny nebo časy.")).toBeVisible(INTERVAL);
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(cell(jana, first, "20:30")).toHaveCount(0);

	// The organizer deletes Jana: her page drops the token and says why (F4).
	await organizer.getByRole("button", { name: "Smazat účastníka Jana" }).click();
	await organizer.getByRole("button", { name: "Smazat účastníka", exact: true }).click();
	await expect(jana.getByText("Tento prohlížeč už v události není zapsaný.")).toBeVisible(INTERVAL);
	await expect(jana.getByLabel("Vaše jméno")).toBeVisible();

	// The organizer deletes the event: the open page shows the not-found content (F4).
	await organizer.getByRole("button", { name: "Smazat událost" }).click();
	await organizer.getByRole("button", { name: "Smazat natrvalo" }).click();
	await expect(jana.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena", INTERVAL);

	await organizer.context().close();
	await jana.context().close();
});
