import { test } from "@playwright/test";

import { createEvent, expect, freshPage, respond } from "./helpers";

// The supported Safari 16.4 has neither Temporal nor Map.groupBy. The pages must load with both
// missing and show the polyfilled Temporal's result, without any error in the page.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

test("the pages work in a browser without Temporal and Map.groupBy", async ({
	browser,
	request,
}) => {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const day = first.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });
	const organizer = await freshPage(browser);
	const { share, admin } = await createEvent(organizer, "Starší prohlížeč", first);

	await respond(request, share, "Jana", first, ["17:00", "17:30"]);

	const older = await freshPage(browser);
	const errors: string[] = [];

	older.on("pageerror", (error) => errors.push(error.message));
	await older.addInitScript(() => {
		Reflect.deleteProperty(globalThis, "Temporal");
		Reflect.deleteProperty(Map, "groupBy");
		Reflect.deleteProperty(Object, "groupBy");
	});

	await older.goto(share);
	await expect(
		older.getByRole("table").getByRole("button", { name: new RegExp(`^${day}, 17:00–`, "u") }),
	).toBeVisible();

	await older.goto(admin);
	await expect(older.getByRole("region", { name: "Výsledný čas" })).toBeVisible();

	await older.goto("/cs");
	await older.getByText("Dny po sobě").click();
	await expect(older.getByLabel("První den")).toBeVisible();

	expect(errors).toEqual([]);
});
