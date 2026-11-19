import { test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, joinAs, respond } from "./helpers";

// Painting at if need be by touch and keyboard, its hatching, and how the group sees it.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

test("a slot painted at if need be is hatched and counts apart in the results", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share } = await createEvent(organizer, "Když bude nutné", first);

	await organizer.context().close();

	const jana = await joinAs(browser, share, "Jana");
	const brush = (name: string) => jana.getByRole("button", { name, exact: true });
	const eight = cell(jana, first, "20:00");

	await expect(brush("Můžu")).toHaveAttribute("aria-pressed", "true");

	// By touch: a press gives the brush's level, and a second press of the same level clears it.
	await brush("Když bude nutné").tap();
	await expect(brush("Když bude nutné")).toHaveAttribute("aria-pressed", "true");
	await eight.tap();
	await expect(eight).toHaveAccessibleName(/když bude nutné$/u);
	await expect(eight.locator("..")).toHaveAttribute("data-fill", "if_need_be");
	await eight.tap();
	await expect(eight).toHaveAttribute("aria-pressed", "false");
	await eight.tap();
	await expect(eight).toHaveAttribute("aria-pressed", "true");

	// By keyboard: choose the brush, then paint a rectangle of two slots.
	await brush("Můžu").focus();
	await jana.keyboard.press("Enter");
	await expect(brush("Můžu")).toHaveAttribute("aria-pressed", "true");
	await cell(jana, first, "19:00").focus();
	await jana.keyboard.press("Shift+ArrowDown");
	await jana.keyboard.press("Space");
	await expect(cell(jana, first, "19:30")).toHaveAccessibleName(/můžete$/u);
	await expect(cell(jana, first, "19:30").locator("..")).toHaveAttribute("data-fill", "4");
	await expect(eight).toHaveAccessibleName(/když bude nutné$/u);

	await jana.getByRole("button", { name: "Uložit" }).click();
	await expect(jana.getByText("Uloženo.")).toBeVisible();
	await jana.context().close();
	await respond(browser, share, "Petr", first, ["20:00"]);

	const viewer = await freshPage(browser);

	await viewer.goto(share);
	await expect(viewer.getByText("Když bude nutné se počítá napůl.")).toBeVisible();

	const windows = viewer.getByRole("region", { name: "Nejlepší časy" }).getByRole("listitem");

	await expect(windows).toHaveCount(1);
	await expect(windows.first()).toContainText(
		/20:00–20:30\s*2 z 2, z toho 1 když bude nutné\s*Jana \(když bude nutné\) a\sPetr/u,
	);

	await cell(viewer, first, "20:00").click();

	const detail = viewer.getByRole("complementary");

	await expect(detail).toContainText("2 z 2, z toho 1 když bude nutné");
	await expect(detail).toContainText(/Můžou\s*Petr\s*Když bude nutné\s*Jana\s*Nemůžou\s*nikdo/u);
	await detail.getByRole("button", { name: "Zavřít detail" }).click();

	// Filtered to Jana, the grid shows her marks and names them.
	await viewer.getByRole("button", { name: "Jana", exact: true }).click();
	await expect(viewer.getByRole("list", { name: "Značky v mřížce" })).toBeVisible();
	await expect(cell(viewer, first, "20:00").locator("..")).toHaveAttribute(
		"data-fill",
		"if_need_be",
	);
	await viewer.context().close();
});
