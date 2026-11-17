import { type Browser, expect as baseExpect, type Page, test } from "@playwright/test";

// Steps 1 to 3 of the Phase 2 acceptance test (Phase 2 spec section 10). Step 4, expiry,
// belongs to the retention rules.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

// Four browsers in one test, like the Phase 1 acceptance test, need its time budget.
test.setTimeout(180_000);

const expect = baseExpect.configure({ timeout: 15_000 });

async function freshPage(browser: Browser): Promise<Page> {
	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId: "Europe/Prague",
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});

	return context.newPage();
}

/** The accessible name of a cell starts with the day as the Czech page writes it. */
function cell(page: Page, date: Temporal.PlainDate, start: string) {
	const day = date.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });

	return page.getByRole("button", { name: new RegExp(`^${day}, ${start}–`, "u") });
}

/** A participant in a fresh browser who joins and marks one slot. */
async function respond(browser: Browser, share: string, name: string, date: Temporal.PlainDate) {
	const page = await freshPage(browser);

	await page.goto(share);
	await page.getByLabel("Vaše jméno").fill(name);
	await page.getByRole("button", { name: "Pokračovat" }).click();
	await expect(page.getByRole("tab", { name: "Já" })).toHaveAttribute("aria-selected", "true");
	await cell(page, date, "20:00").click();
	await expect(cell(page, date, "20:00")).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("button", { name: "Uložit" }).click();
	await expect(page.getByText("Uloženo.")).toBeVisible();
	await page.context().close();
}

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
	await organizer.goto("/cs");
	await organizer.getByLabel("Název").fill("Zkouška kapely");
	await organizer.getByText("Dny po sobě").click();
	await organizer.getByLabel("První den").fill(first.toString());
	await organizer.getByLabel("Poslední den").fill(first.add({ days: 1 }).toString());
	await organizer.getByLabel("Každý den od").selectOption({ label: "17:00" });
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "21:00" });
	await organizer.getByRole("button", { name: "Vytvořit událost" }).click();
	await organizer.waitForURL(/\/created$/u);

	const share = await organizer.getByLabel("Odkaz pro účastníky").inputValue();
	const admin = await organizer.getByLabel("Odkaz pro správu").inputValue();

	await respond(browser, share, "Jana", first);
	await respond(browser, share, "Petr", first);

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
