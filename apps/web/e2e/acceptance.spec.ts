import { type Browser, expect, type Page, test } from "@playwright/test";

// The acceptance test of spec section 13, in the 390 by 844 viewport it is defined for.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined for the phone viewport.");

test.setTimeout(180_000);

const PRAGUE = "Europe/Prague";
const NEW_YORK = "America/New_York";

const PEOPLE = [
	"Jana",
	"Petr",
	"Klára",
	"Tomáš",
	"Eva",
	"Ondřej",
	"Lucie",
	"Marek",
	"Adéla",
	"Filip",
];

const WITH_PASSWORD = new Set(["Jana", "Petr", "Klára"]);
const PASSWORD = "zkouska-123";

/** Hours Prague is ahead of New York at noon on `date`. */
function offsetHours(date: Temporal.PlainDate): number {
	const noon = (zone: string) =>
		date.toZonedDateTime({ timeZone: zone, plainTime: "12:00" }).offsetNanoseconds;

	return (noon(PRAGUE) - noon(NEW_YORK)) / 3_600_000_000_000;
}

/**
 * Five consecutive dates at least two weeks ahead, all in a week when Prague is 6 hours
 * ahead of New York. The server checks dates against its own clock, which a browser test
 * cannot fix, so the test picks the dates from today instead (spec section 13, step 1).
 */
function eventDates(): Temporal.PlainDate[] {
	let first = Temporal.Now.plainDateISO(PRAGUE).add({ days: 14 });

	for (;;) {
		const start = first;
		const dates = Array.from({ length: 5 }, (_, offset) => start.add({ days: offset }));

		if (dates.every((date) => offsetHours(date) === 6)) {
			return dates;
		}

		first = first.add({ days: 7 });
	}
}

/** The accessible name of a cell starts with the day as the Czech page writes it. */
function day(date: Temporal.PlainDate): string {
	return date.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });
}

function cell(page: Page, date: Temporal.PlainDate, start: string) {
	return page.getByRole("button", { name: new RegExp(`^${day(date)}, ${start}–`, "u") });
}

async function freshPage(browser: Browser, timezoneId = PRAGUE) {
	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId,
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});

	return context.newPage();
}

test("ten people find the one hour that suits everyone (spec section 13)", async ({ browser }) => {
	const dates = eventDates();
	const [first, , , fourth, last] = dates;

	if (first === undefined || fourth === undefined || last === undefined) {
		throw new Error("Five dates are needed.");
	}

	// Step 1: the organizer creates the event.
	const organizer = await freshPage(browser);

	await organizer.goto("/cs");
	await organizer.getByLabel("Název").fill("Zkouška kapely");
	await organizer.getByText("Dny po sobě").click();
	await organizer.getByLabel("První den").fill(first.toString());
	await organizer.getByLabel("Poslední den").fill(last.toString());
	await organizer.getByLabel("Každý den od").selectOption({ label: "17:00" });
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "21:00" });
	await organizer.getByLabel("Délka políčka").selectOption({ label: "30 min" });
	await expect(organizer.getByLabel("Časové pásmo události")).toHaveValue(PRAGUE);
	await organizer.getByRole("button", { name: "Vytvořit událost" }).click();
	await organizer.waitForURL(/\/created$/u);

	const share = await organizer.getByLabel("Odkaz pro účastníky").inputValue();

	await organizer.context().close();

	// Steps 2 and 3: ten people join in fresh browsers and paint different patterns. Only the
	// fourth date from 18:00 to 19:00 is common to all; each person also marks one other slot.
	const others = ["17:00", "17:30", "19:00", "19:30", "20:00", "20:30"];
	const common: Temporal.PlainDate = fourth;
	const fallback: Temporal.PlainDate = first;

	async function respond(name: string, index: number) {
		const page = await freshPage(browser);

		await page.goto(share);
		await page.getByLabel("Vaše jméno").fill(name);

		if (WITH_PASSWORD.has(name)) {
			await page.getByLabel("Heslo (nepovinné)").fill(PASSWORD);
		}

		await page.getByRole("button", { name: "Pokračovat" }).click();
		await expect(page.getByRole("tab", { name: "Já" })).toHaveAttribute("aria-selected", "true");
		await cell(page, common, "18:00").click();
		await cell(page, common, "18:30").click();
		await cell(
			page,
			dates[index % 5] ?? fallback,
			others[index % others.length] ?? "17:00",
		).click();
		await page.getByRole("button", { name: "Uložit" }).click();
		await expect(page.getByText("Uloženo.")).toBeVisible();
		await page.context().close();
	}

	// The ten browsers work at the same time, as a group answering a shared link would.
	await Promise.all(PEOPLE.map((name, index) => respond(name, index)));

	// Step 4: a visitor who has not joined sees "10 of 10" in exactly the two common slots.
	const visitor = await freshPage(browser);

	await visitor.goto(share);

	const everyone = visitor.getByRole("button", { name: /, 10 z 10$/u });

	await expect(everyone).toHaveCount(2);
	await expect(cell(visitor, fourth, "18:00")).toHaveAccessibleName(/10 z 10$/u);
	await expect(cell(visitor, fourth, "18:30")).toHaveAccessibleName(/10 z 10$/u);
	await visitor.context().close();

	// Step 5: a participant with a password returns in a fresh browser.
	const returning = await freshPage(browser);

	await returning.goto(share);
	await returning.getByLabel("Vaše jméno").fill("Jana");
	await returning.getByLabel("Heslo (nepovinné)").fill("spatne-heslo");
	await returning.getByRole("button", { name: "Pokračovat" }).click();
	await expect(returning.getByText("Heslo nesouhlasí.")).toBeVisible();
	await returning.getByLabel("Heslo (nepovinné)").fill(PASSWORD);
	await returning.getByRole("button", { name: "Pokračovat" }).click();
	await expect(returning.getByText("Vyplňujete jako")).toBeVisible();
	await expect(cell(returning, fourth, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(cell(returning, fourth, "18:30")).toHaveAttribute("aria-pressed", "true");
	await expect(returning.locator('tbody button[aria-pressed="true"]')).toHaveCount(3);
	await returning.context().close();

	// Step 6: in New York the common window is 12:00 to 13:00 on the same date (T1, T2).
	const newYork = await freshPage(browser, NEW_YORK);

	await newYork.goto(share);
	await expect(
		newYork.getByText("Mřížka ukazuje časy ve vašem pásmu, America/New York."),
	).toBeVisible();
	await expect(cell(newYork, fourth, "12:00")).toHaveAccessibleName(/10 z 10$/u);
	await expect(cell(newYork, fourth, "12:30")).toHaveAccessibleName(/10 z 10$/u);
	await expect(newYork.getByRole("button", { name: /, 10 z 10$/u })).toHaveCount(2);
	await newYork.context().close();
});
