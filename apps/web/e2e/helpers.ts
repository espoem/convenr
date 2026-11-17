import { type Browser, expect as baseExpect, type Page } from "@playwright/test";

// Several browsers in one test on a busy machine can take longer than the default 5 seconds.
export const expect = baseExpect.configure({ timeout: 15_000 });

/** A browser of its own, so that local storage and the joined participant stay apart. */
export async function freshPage(browser: Browser, timezoneId = "Europe/Prague"): Promise<Page> {
	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId,
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});

	return context.newPage();
}

/**
 * A grid cell. Its accessible name starts with the day as the Czech page writes it, like a
 * best window's button below the grid, so the search stays inside the grid.
 */
export function cell(page: Page, date: Temporal.PlainDate, start: string) {
	const day = date.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });

	return page
		.getByRole("table")
		.getByRole("button", { name: new RegExp(`^${day}, ${start}–`, "u") });
}

/** Creates a two-day event in Prague from 17:00 to 21:00 and returns its two links. */
export async function createEvent(page: Page, name: string, first: Temporal.PlainDate) {
	await page.goto("/cs");
	await page.getByLabel("Název").fill(name);
	await page.getByText("Dny po sobě").click();
	await page.getByLabel("První den").fill(first.toString());
	await page.getByLabel("Poslední den").fill(first.add({ days: 1 }).toString());
	await page.getByLabel("Každý den od").selectOption({ label: "17:00" });
	await page.getByLabel("do", { exact: true }).selectOption({ label: "21:00" });
	await page.getByRole("button", { name: "Vytvořit událost" }).click();
	await page.waitForURL(/\/created$/u);

	return {
		share: await page.getByLabel("Odkaz pro účastníky").inputValue(),
		admin: await page.getByLabel("Odkaz pro správu").inputValue(),
	};
}

/** Marks cells one at a time: each click must land before the next one counts. */
async function mark(page: Page, date: Temporal.PlainDate, starts: string[]): Promise<void> {
	const [start, ...rest] = starts;

	if (start === undefined) {
		return;
	}

	await cell(page, date, start).click();
	await expect(cell(page, date, start)).toHaveAttribute("aria-pressed", "true");
	await mark(page, date, rest);
}

/** A participant in a fresh browser who joins and marks the slots starting at `starts`. */
export async function respond(
	browser: Browser,
	share: string,
	name: string,
	date: Temporal.PlainDate,
	starts: string[],
) {
	const page = await freshPage(browser);

	await page.goto(share);
	// A dated grid appears only after hydration; a click before it would be lost.
	await expect(page.getByRole("table")).toBeVisible();
	await page.getByLabel("Vaše jméno").fill(name);
	await page.getByRole("button", { name: "Pokračovat" }).click();
	await expect(page.getByRole("tab", { name: "Já" })).toHaveAttribute("aria-selected", "true");

	await mark(page, date, starts);
	await page.getByRole("button", { name: "Uložit" }).click();
	await expect(page.getByText("Uloženo.")).toBeVisible();
	await page.context().close();
}
