import { type Browser, test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, joinAs, joinIn, mark } from "./helpers";
import { POLL_BASE_URL, POLL_SECONDS } from "./servers";

// Live updates. The main server streams changes, as an instance does by default: a check would
// come only after 15 seconds, so a change that shows within 2 seconds arrived through the stream.
// Tests that wait for a check run on an installed clock that they move on instead of waiting.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

const PUSHED = { timeout: 2000 };
const CHECK_MS = 15_000;

test("an open page shows other people's changes and keeps its own unsaved edits", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share, admin } = await createEvent(organizer, "Živá událost", first);
	const jana = await freshPage(browser);

	await joinIn(jana, share, "Jana");

	// Jana's unsaved edit stays while Petr's save appears without a reload.
	await mark(jana, first, ["18:00", "20:30"]);

	const petr = await joinAs(browser, share, "Petr");

	await mark(petr, first, ["20:00"]);
	await petr.getByRole("button", { name: "Uložit" }).click();
	await expect(petr.getByText("Uloženo.")).toBeVisible();
	await petr.context().close();

	await expect(jana.getByRole("heading", { name: "Účastníci (2)" })).toBeVisible(PUSHED);
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(jana.getByRole("button", { name: "Uložit" })).toBeEnabled();

	// The organizer ends the day at 19:00: Jana's edit at 20:30 drops out and her page says so,
	// while the one at 18:00 stays.
	await organizer.goto(admin);
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();
	await expect(jana.getByText("Pořadatel mezitím změnil dny nebo časy.")).toBeVisible(PUSHED);
	await expect(cell(jana, first, "18:00")).toHaveAttribute("aria-pressed", "true");
	await expect(cell(jana, first, "20:30")).toHaveCount(0);

	// Eva joins; the organizer's open manage page lists her without a reload.
	await someoneJoins(browser, share, "Eva");
	await expect(organizer.getByRole("heading", { name: "Účastníci (3)" })).toBeVisible(PUSHED);

	// The organizer deletes Jana: her page drops the token and says why.
	await organizer.getByRole("button", { name: "Smazat účastníka Jana" }).click();
	await organizer.getByRole("button", { name: "Smazat účastníka", exact: true }).click();
	await expect(organizer.getByRole("heading", { name: "Účastníci (2)" })).toBeVisible();
	await expect(jana.getByText("Tento prohlížeč už v události není zapsaný.")).toBeVisible(PUSHED);
	await expect(jana.getByLabel("Vaše jméno")).toBeVisible();

	// The organizer deletes the event: the open page shows the not-found content.
	await organizer.getByRole("button", { name: "Smazat událost" }).click();
	await organizer.getByRole("button", { name: "Smazat natrvalo" }).click();
	await organizer.waitForURL(/\/cs$/u);
	await expect(jana.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena", PUSHED);

	await organizer.context().close();
	await jana.context().close();
});

/** Someone joins the event, which changes its version. */
async function someoneJoins(browser: Browser, share: string, name: string) {
	const page = await joinAs(browser, share, name);

	await page.context().close();
}

test("a page whose stream fails twice checks for changes instead", async ({ browser }) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share } = await createEvent(organizer, "Bez proudu", first);
	const jana = await freshPage(browser);

	await organizer.context().close();
	await jana.route("**/api/live/**", (route) => route.fulfill({ status: 503 }));
	await jana.clock.install();
	await jana.goto(share);
	await expect(jana.getByRole("heading", { name: "Účastníci (0)" })).toBeVisible();
	// The first refusal opens the stream again after a second; the second gives way to checks.
	await jana.clock.fastForward(1000);
	await someoneJoins(browser, share, "Petr");
	await jana.clock.fastForward(CHECK_MS);
	await expect(jana.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible();
	await jana.context().close();
});

test("an instance that checks for changes shows them after the interval", async ({ browser }) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share } = await createEvent(organizer, "Kontroly", first);
	const jana = await freshPage(browser);
	const onPollServer = new URL(new URL(share).pathname, POLL_BASE_URL).toString();
	const streams: string[] = [];

	await organizer.context().close();
	jana.on("request", (request) => {
		if (request.url().includes("/api/live/")) {
			streams.push(request.url());
		}
	});
	await jana.clock.install();
	await jana.goto(onPollServer);
	await expect(jana.getByRole("heading", { name: "Účastníci (0)" })).toBeVisible();
	await someoneJoins(browser, share, "Petr");
	await jana.clock.fastForward(POLL_SECONDS * 1000);
	await expect(jana.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible();
	expect(streams).toEqual([]);
	await jana.context().close();
});

test("an idle page pauses its updates and resumes on input", async ({ browser }) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share } = await createEvent(organizer, "Nečinná stránka", first);
	const jana = await freshPage(browser);

	await organizer.context().close();
	await jana.clock.install();
	await jana.goto(share);
	await expect(jana.getByRole("heading", { name: "Účastníci (0)" })).toBeVisible();
	// The idle timer starts with hydration, after which the dated grid appears; a clock moved
	// before it would pass unnoticed.
	await expect(jana.getByRole("table")).toBeVisible();

	// Thirty minutes without input stop the stream and say so.
	await jana.clock.fastForward("30:00");
	await expect(jana.getByText("Aktualizace jsou pozastavené")).toBeVisible();
	await someoneJoins(browser, share, "Petr");
	await expect(jana.getByRole("heading", { name: "Účastníci (0)" })).toBeVisible();

	// A key press opens the stream again, which reports the version Jana has not seen.
	await jana.keyboard.press("Shift");
	await expect(jana.getByText("Aktualizace jsou pozastavené")).toHaveCount(0);
	await expect(jana.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible(PUSHED);
	await jana.context().close();
});
