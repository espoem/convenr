import { type APIRequestContext, test } from "@playwright/test";

import { createdEventSchema, joinedSchema } from "../src/server/api/schemas";
import { expect, freshPage } from "./helpers";

/** A weekday event made through the API; its page address redirects to the one with the slug. */
async function weekdayEvent(request: APIRequestContext): Promise<string> {
	const created = await request.post("/api/v1/events", {
		data: {
			name: "Identita",
			referenceZone: "Europe/Prague",
			schedule: {
				mode: "weekdays",
				weekdays: [1],
				dailyStart: "17:00",
				dailyEnd: "19:00",
				slotMinutes: 60,
			},
		},
	});

	return createdEventSchema.parse(await created.json()).event.id;
}

// The browser's key (ADR 0008): the server knows who a browser joined as, so the page arrives
// joined, and a token kept in local storage by an earlier release moves to the key.
test.describe("browser identity", () => {
	test("renders the joined participant in the first response, also without scripts", async ({
		browser,
		request,
	}) => {
		const id = await weekdayEvent(request);
		const page = await freshPage(browser);

		await page.goto(`/cs/e/x-${id}`);
		await page.getByLabel("Vaše jméno").fill("Jana");
		await page.getByRole("button", { name: "Pokračovat" }).click();
		await expect(page.getByText("Vyplňujete jako Jana")).toBeVisible();

		const stored = await page.context().storageState();

		expect(JSON.stringify(stored.origins)).not.toContain("cvp_");

		const scriptless = await browser.newContext({ javaScriptEnabled: false, storageState: stored });
		const reloaded = await scriptless.newPage();

		await reloaded.goto(`/cs/e/x-${id}`);
		await expect(reloaded.getByText("Vyplňujete jako Jana")).toBeVisible();
		await expect(reloaded.getByLabel("Vaše jméno")).toHaveCount(0);

		await scriptless.close();
		await page.context().close();
	});

	test("moves a token from local storage to the browser's key", async ({ browser, request }) => {
		const id = await weekdayEvent(request);

		const joined = await request.post(`/api/v1/events/${id}/participants`, {
			data: { name: "Petr" },
		});

		const { participantToken } = joinedSchema.parse(await joined.json());

		const page = await freshPage(browser);

		const record = {
			id,
			name: "Identita",
			segment: `x-${id}`,
			participant: { name: "Petr", token: participantToken },
		};

		await page.addInitScript(
			(events) => {
				if (localStorage.getItem("convenr.events") === null) {
					localStorage.setItem("convenr.events", events);
				}
			},
			JSON.stringify({ [id]: record }),
		);

		await page.goto(`/cs/e/x-${id}`);
		await expect(page.getByText("Vyplňujete jako Petr")).toBeVisible();
		await expect
			.poll(() => page.evaluate(() => localStorage.getItem("convenr.events")))
			.not.toContain("cvp_");

		// The token from local storage is retired; the browser's own key opens the event now.
		const retired = await request.get(`/api/v1/events/${id}/participants/me`, {
			headers: { Authorization: `Bearer ${participantToken}` },
		});

		expect(retired.status()).toBe(401);

		await page.reload();
		await expect(page.getByText("Vyplňujete jako Petr")).toBeVisible();
		await page.context().close();
	});
});
