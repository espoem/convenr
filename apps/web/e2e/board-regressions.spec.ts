import { test } from "@playwright/test";

import { createEvent, expect, expectSteady, joinAs, respond } from "./helpers";

test.setTimeout(180_000);

test("copy button shows icon on narrow screens, preserves tab on reload and locale switch, and resets stale best-window highlight", async ({
	browser,
	request,
}, testInfo) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const { viewport, hasTouch } = testInfo.project.use;

	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId: "Europe/Prague",
		viewport: viewport ?? { width: 390, height: 844 },
		hasTouch: hasTouch ?? true,
		permissions: ["clipboard-read", "clipboard-write"],
	});

	const organizer = await context.newPage();
	const { share } = await createEvent(organizer, "Regrese tabulky", first);
	const errors: string[] = [];

	organizer.on("pageerror", (error) => errors.push(error.message));
	organizer.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});

	await organizer.goto(share);

	const copyButton = organizer.getByRole("button", { name: "Kopírovat" });
	const copyBox = await copyButton.boundingBox();

	expect(copyBox).not.toBeNull();

	if (testInfo.project.name === "phone") {
		expect(copyBox?.width).toBeLessThanOrEqual(48);
	} else {
		expect(copyBox?.width).toBeGreaterThan(60);
	}

	await expectSteady(copyButton, () => copyButton.click());
	await expect(organizer.getByText("Zkopírováno.")).toBeVisible();
	await expect(organizer.getByText("Zkopírováno.")).toHaveCount(0, { timeout: 6000 });
	await context.close();

	await respond(request, share, "Jana", first, ["17:00", "17:30", "18:00"]);
	await respond(request, share, "Petr", first, ["17:00"]);

	const eva = await joinAs(browser, share, "Eva");

	eva.on("pageerror", (error) => errors.push(error.message));
	eva.on("console", (message) => {
		if (message.type() === "error") {
			errors.push(message.text());
		}
	});

	// Best windows stay hidden while editing personal availability.
	await expect(eva.getByRole("tab", { name: "Já" })).toHaveAttribute("aria-selected", "true");
	await expect(eva.getByRole("region", { name: "Nejlepší časy" })).toHaveCount(0);

	await eva.getByRole("tab", { name: "Skupina" }).click();
	await expect(eva).toHaveURL(/\?tab=group$/u);
	await expect(eva.getByRole("region", { name: "Nejlepší časy" })).toBeVisible();

	const firstWindow = eva
		.getByRole("region", { name: "Nejlepší časy" })
		.getByRole("listitem")
		.first()
		.getByRole("button");

	await firstWindow.click();
	await expect(firstWindow).toHaveAttribute("aria-pressed", "true");

	// Changing filters resets any highlighted window rather than leaving a stale outline.
	await eva.getByLabel("Délka aspoň").selectOption("2");
	await expect(
		eva.getByRole("region", { name: "Nejlepší časy" }).getByRole("listitem"),
	).toHaveCount(0);
	await eva.getByLabel("Délka aspoň").selectOption("1");
	await expect(firstWindow).toHaveAttribute("aria-pressed", "false");

	await eva.reload();
	await expect(eva.getByRole("tab", { name: "Skupina" })).toHaveAttribute("aria-selected", "true");

	await eva.getByLabel("Jazyk: Čeština").click();
	await eva.getByRole("link", { name: "English" }).click();
	await expect(eva).toHaveURL(/\/en\/e\/.*\?tab=group$/u);
	await expect(eva.getByRole("tab", { name: "Group" })).toHaveAttribute("aria-selected", "true");

	// Leaving from the Group tab returns cleanly to the join form with zero errors.
	await eva.getByRole("button", { name: "Not Eva?" }).click();
	await expect(eva.getByLabel("Your name")).toBeVisible();
	await expect(eva.getByText("Filling in as")).toHaveCount(0);
	await expect(eva.getByText("This browser is no longer joined to the event.")).toHaveCount(0);
	expect(errors).toEqual([]);
	await eva.context().close();
});

test("keeps layout within 360px across home date picker, event board, and manage page", async ({
	browser,
}, testInfo) => {
	test.skip(testInfo.project.name !== "phone", "Narrow 360px overflow check runs once.");

	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });

	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId: "Europe/Prague",
		viewport: { width: 360, height: 800 },
		hasTouch: true,
	});

	const page = await context.newPage();

	const expectNoOverflow = async () => {
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		);

		expect(overflow).toBeLessThanOrEqual(0);
	};

	await page.goto("/cs");
	await expect(page.getByRole("button", { name: "Předchozí měsíc" })).toBeVisible();
	await expectNoOverflow();

	const { share, admin } = await createEvent(page, "Úzký displej s velmi dlouhým názvem", first);

	await page.goto(share);
	await expect(page.getByRole("table")).toBeVisible();
	await expectNoOverflow();

	await page.getByRole("tab", { name: "Skupina" }).click();
	await expectNoOverflow();

	await page.goto(admin);
	await expect(page.getByRole("button", { name: "Uložit změny" })).toBeVisible();
	await expectNoOverflow();

	await context.close();
});
