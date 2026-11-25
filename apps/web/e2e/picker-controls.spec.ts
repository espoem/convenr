import { type Page, test } from "@playwright/test";

import { expect } from "./helpers";

/** How each select, date and time control on the page draws its frame and its one indicator. */
function pickers(page: Page) {
	return page
		.locator("main")
		.locator('select, input[type="date"], input[type="time"]')
		.evaluateAll((controls) =>
			controls.map((control) => {
				const style = getComputedStyle(control);
				const box = control.getBoundingClientRect();
				const icon = control.parentElement?.querySelector("svg")?.getBoundingClientRect();

				return {
					appearance: style.appearance,
					height: box.height,
					textInset: style.paddingRight,
					iconInset: icon === undefined ? undefined : Math.round(box.right - icon.right),
					iconCentered:
						icon !== undefined &&
						Math.abs(icon.top + icon.height / 2 - (box.top + box.height / 2)) < 1,
					opensAtIcon:
						icon !== undefined &&
						document.elementFromPoint(icon.left + icon.width / 2, icon.top + icon.height / 2) ===
							control,
				};
			}),
		);
}

const UNIFORM = {
	appearance: "none",
	height: 44,
	textInset: "40px",
	iconInset: 12,
	iconCentered: true,
};

test("every select, date and time control shows the same frame and one indicator", async ({
	page,
}) => {
	await page.goto("/cs");

	// The grid with a range: two dates, two daily times, the slot, the zone and the week.
	await page.getByText("Dny po sobě").click();
	await expect(page.getByLabel("První den")).toBeVisible();

	const grid = await pickers(page);

	expect(grid).toHaveLength(7);

	for (const picker of grid) {
		expect(picker).toMatchObject(UNIFORM);
	}

	// The poll: a date, two times and the zone.
	await page.getByText("Pár vybraných termínů").click();
	await expect(page.getByLabel("Datum")).toBeVisible();

	const poll = await pickers(page);

	expect(poll).toHaveLength(4);

	for (const picker of poll) {
		expect(picker).toMatchObject(UNIFORM);
	}

	const date = page.getByLabel("Datum");

	await date.scrollIntoViewIfNeeded();
	expect((await pickers(page))[0]?.opensAtIcon).toBe(true);
	await date.fill("2030-03-04");
	await expect(date).toHaveValue("2030-03-04");
});
