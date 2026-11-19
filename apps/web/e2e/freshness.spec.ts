import { test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, joinAs, joinIn, mark } from "./helpers";

// The version check. A check runs every 15 seconds; Jana's page runs on an installed clock
// that the test moves on by one interval, instead of waiting for it.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

const INTERVAL_MS = 15_000;

test("an open page shows other people's changes and keeps its own unsaved edits", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share, admin } = await createEvent(organizer, "Živá událost", first);
	const jana = await freshPage(browser);

	// Time keeps flowing on the installed clock; `fastForward` fires the check that is due.
	await jana.clock.install();
	await joinIn(jana, share, "Jana");

	const nextCheck = () => jana.clock.fastForward(INTERVAL_MS);

	// Jana's unsaved edit stays while Petr's save appears without a reload.
	await mark(jana, first, ["18:00", "20:30"]);

	const petr = await joinAs(browser, share, "Petr");

	await mark(petr, first, ["20:00"]);
	await petr.getByRole("button", { name: "Uložit" }).click();
	await expect(petr.getByText("Uloženo.")).toBeVisible();
	await petr.context().close();

	await nextCheck();
	await expect(jana.getByRole("heading", { name: "Účastníci (2)" })).toBeVisible();
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(jana.getByRole("button", { name: "Uložit" })).toBeEnabled();

	// The organizer ends the day at 19:00: Jana's edit at 20:30 drops out and her page says so,
	// while the one at 18:00 stays.
	await organizer.goto(admin);
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();
	await nextCheck();
	await expect(jana.getByText("Pořadatel mezitím změnil dny nebo časy.")).toBeVisible();
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(cell(jana, first, "20:30")).toHaveCount(0);

	// The organizer deletes Jana: her page drops the token and says why.
	await organizer.getByRole("button", { name: "Smazat účastníka Jana" }).click();
	await organizer.getByRole("button", { name: "Smazat účastníka", exact: true }).click();
	await expect(organizer.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible();
	await nextCheck();
	await expect(jana.getByText("Tento prohlížeč už v události není zapsaný.")).toBeVisible();
	await expect(jana.getByLabel("Vaše jméno")).toBeVisible();

	// The organizer deletes the event: the open page shows the not-found content.
	await organizer.getByRole("button", { name: "Smazat událost" }).click();
	await organizer.getByRole("button", { name: "Smazat natrvalo" }).click();
	await organizer.waitForURL(/\/cs$/u);
	await nextCheck();
	await expect(jana.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena");

	await organizer.context().close();
	await jana.context().close();
});
