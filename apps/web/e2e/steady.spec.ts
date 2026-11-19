import { type Page, test } from "@playwright/test";

import { createEvent, expect, expectSteady, freshPage, joinAs, respond } from "./helpers";

// Every control that is pressed or selected, on the pages that have them, changes state
// without moving the controls of its own group. A new control of this kind is checked here
// without a test of its own. Grid cells are left out: painting them is tested on its own.
const CONTROLS = "[aria-pressed]:not(.cv-cell-button), [role='tab']";
const GROUP = "fieldset, [role='tablist'], ul, ol, table";

test.setTimeout(180_000);

/**
 * Presses each visible control from `index` on, one after another because a press can change
 * what the next one finds, and checks that its group stays where it was. Returns how many it
 * pressed.
 */
async function pressEach(page: Page, index = 0): Promise<number> {
	const controls = page.locator("main").locator(CONTROLS);

	if (index >= (await controls.count())) {
		return 0;
	}

	const control = controls.nth(index);

	if (!(await control.isVisible()) || !(await control.isEnabled())) {
		return pressEach(page, index + 1);
	}

	const group = `steady-${index}`;

	await control.evaluate(
		(element, { selector, marker }) => {
			const owner = element.parentElement?.closest<HTMLElement>(selector) ?? element.parentElement;

			if (owner !== null) {
				owner.dataset["steady"] = marker;
			}
		},
		{ selector: GROUP, marker: group },
	);
	await expectSteady(page.locator(`[data-steady="${group}"] :is(button, [role='tab'])`), () =>
		control.click(),
	);

	return 1 + (await pressEach(page, index + 1));
}

test("pressing or selecting a control does not move the controls beside it", async ({
	browser,
	request,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);

	await organizer.goto("/cs");
	// The date picker appears once the page has hydrated.
	await expect(organizer.locator("main").locator(CONTROLS).first()).toBeVisible();
	expect(await pressEach(organizer)).toBeGreaterThan(0);

	const { share } = await createEvent(organizer, "Klidná stránka", first);

	await organizer.context().close();
	await respond(request, share, "Jana", first, ["18:00", "18:30"]);
	await respond(request, share, "Petr", first, ["18:00"]);

	const eva = await joinAs(browser, share, "Eva");

	expect(await pressEach(eva)).toBeGreaterThan(0);
	await eva.getByRole("tab", { name: "Skupina" }).click();
	expect(await pressEach(eva)).toBeGreaterThan(0);
	await eva.context().close();
});
