import { test } from "@playwright/test";

import { createEvent, expect, freshPage, respond } from "./helpers";

test.setTimeout(180_000);

test("the best windows follow the filters and the zone switch shows the event's zone", async ({
	browser,
	request,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);
	const { share } = await createEvent(organizer, "Výběr času", first);

	await organizer.context().close();
	await respond(request, share, "Jana", first, ["20:00"]);
	await respond(request, share, "Petr", first, ["20:00", "20:30"]);

	const viewer = await freshPage(browser, "America/New_York");

	await viewer.goto(share);
	await expect(
		viewer.getByText("Mřížka ukazuje časy ve vašem pásmu, America/New York."),
	).toBeVisible();
	await viewer.getByRole("button", { name: "Ukázat časy v pásmu Europe/Prague" }).click();
	await expect(
		viewer.getByText("Mřížka ukazuje časy v pásmu události, Europe/Prague."),
	).toBeVisible();

	// The people filter starts at the highest count, so only the window of both shows.
	const windows = viewer.getByRole("region", { name: "Nejlepší časy" }).getByRole("listitem");

	await expect(windows).toHaveCount(1);
	await expect(windows.first()).toContainText(/20:00–20:30\s*2 z 2\s*Jana a\sPetr/u);

	await viewer.getByLabel("Lidí aspoň").selectOption("1");
	await expect(windows).toHaveCount(2);
	await expect(windows.nth(1)).toContainText(/20:00–21:00\s*1 z 2\s*Petr/u);

	const best = windows.first().getByRole("button");

	await best.click();
	await expect(best).toHaveAttribute("aria-pressed", "true");
	await viewer.context().close();
});
