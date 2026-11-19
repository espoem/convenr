import { readFile } from "node:fs/promises";

import { test } from "@playwright/test";

import { cell, createEvent, expect, freshPage, respond } from "./helpers";

// Picking, showing, changing and clearing the final time.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

test("the organizer picks a final time that the event page shows, and narrowing clears it", async ({
	browser,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const day = first.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });
	const organizer = await freshPage(browser);
	const { share, admin } = await createEvent(organizer, "Výběr termínu", first);

	await respond(browser, share, "Jana", first, ["17:00", "17:30"]);
	await respond(browser, share, "Petr", first, ["17:00"]);

	// A best window, picked on the manage page.
	await organizer.goto(admin);

	const picker = organizer.getByRole("region", { name: "Konečný čas" });

	await expect(picker.getByText("Konečný čas zatím není vybraný.")).toBeVisible();
	await organizer
		.getByRole("region", { name: "Nejlepší časy" })
		.getByRole("button", { name: new RegExp(`^${day}, 17:00–17:30`, "u") })
		.click();
	await expect(picker.getByText(`Vybráno: ${day}, 17:00–17:30`)).toBeVisible();
	await picker.getByRole("button", { name: "Vybrat jako konečný čas" }).click();
	await expect(picker.getByText(/^Konečný čas je .*17:00–17:30\.$/u)).toBeVisible();

	// Changed to a run selected in the grid, where nobody is available.
	await cell(organizer, first, "20:00").click();
	await cell(organizer, first, "20:30").click();
	await expect(picker.getByText(`Vybráno: ${day}, 20:00–21:00`)).toBeVisible();
	await picker.getByRole("button", { name: "Vybrat jako konečný čas" }).click();
	await expect(picker.getByText(/^Konečný čas je .*20:00–21:00\.$/u)).toBeVisible();

	const viewer = await freshPage(browser);

	await viewer.goto(share);

	const banner = viewer.getByRole("region", { name: "Konečný čas" });

	await expect(banner).toContainText("20:00–21:00");
	await expect(banner).toContainText("Ve vašem časovém pásmu, Europe/Prague.");
	await expect(
		cell(viewer, first, "20:00").locator("xpath=..").locator(".cv-final"),
	).toHaveAttribute("data-edge", "top");
	await expect(
		cell(viewer, first, "20:30").locator("xpath=..").locator(".cv-final"),
	).toHaveAttribute("data-edge", "bottom");
	await expect(viewer.getByRole("table").getByText("Konečný čas")).toHaveCount(1);

	// The calendar file holds the final time in UTC and a share link that opens the event.
	const utc = (time: string) =>
		first
			.toZonedDateTime({ timeZone: "Europe/Prague", plainTime: time })
			.toInstant()
			.toString()
			.replaceAll(/[-:]/gu, "");

	const downloading = viewer.waitForEvent("download");

	await banner.getByRole("link", { name: "Stáhnout do kalendáře (.ics)" }).click();

	const download = await downloading;
	const path = await download.path();
	const file = (await readFile(path, "utf8")).replaceAll("\r\n ", "");

	expect(download.suggestedFilename()).toMatch(/^vyber-terminu-\w+\.ics$/u);
	expect(file).toContain(`DTSTART:${utc("20:00")}`);
	expect(file).toContain(`DTEND:${utc("21:00")}`);
	expect(file).toContain("SEQUENCE:2");
	expect(file).not.toContain(admin.split("#")[1] ?? "no secret");

	const link = /^URL:(.+)$/mu.exec(file)?.[1]?.trim() ?? "";

	expect(link).toMatch(/\/e\/vyber-terminu-\w+$/u);
	await expect(banner.getByRole("link", { name: "Přidat do Google Kalendáře" })).toHaveAttribute(
		"href",
		new RegExp(`dates=${utc("20:00")}%2F${utc("21:00")}`, "u"),
	);
	await expect(banner.getByRole("link", { name: "Přidat do Outlook.com" })).toHaveAttribute(
		"href",
		/^https:\/\/outlook\.live\.com\//u,
	);

	const follower = await freshPage(browser);

	await follower.goto(link);
	await expect(follower).toHaveURL(/\/cs\/e\/vyber-terminu-\w+$/u);
	await expect(follower.getByRole("heading", { name: "Výběr termínu" })).toBeVisible();
	await follower.context().close();

	// Narrowing the hours asks about the final time although nobody loses availability.
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "20:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();

	const asked = organizer.getByRole("alert").filter({ hasText: "konečný čas zruší" });

	await expect(asked).toBeVisible();
	await expect(asked).not.toContainText("dostupnosti");
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();
	await expect(picker.getByText("Konečný čas zatím není vybraný.")).toBeVisible();

	await viewer.reload();
	await expect(viewer.getByRole("region", { name: "Konečný čas", exact: true })).toHaveCount(0);

	await viewer.context().close();
	await organizer.context().close();
});
