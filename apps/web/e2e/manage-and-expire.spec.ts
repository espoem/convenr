import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { type Page, test } from "@playwright/test";
import { Pool } from "pg";

import { DATABASE_URL } from "./database";
import { cell, createEvent, expect, freshPage, respond } from "./helpers";

// The second acceptance test: an organizer narrows an event, deletes participants and an
// event, and an expired event disappears, in the phone viewport.
test.skip(({ viewport }) => viewport?.width !== 390, "Defined once, for the phone viewport.");

test.setTimeout(180_000);

async function expectGone(page: Page, link: string) {
	await page.goto(link);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stránka nenalezena");
}

/** The event id is the last part of the link's segment (ADR 0003). */
function idOf(link: string): string {
	return link.split("-").at(-1) ?? "";
}

test("the organizer manages an event and expired events disappear", async ({ browser }) => {
	const database = new Pool({ connectionString: DATABASE_URL, max: 1 });

	async function rows(query: string, values: string[]): Promise<number> {
		const result = await database.query<{ total: number }>(query, values);

		return result.rows[0]?.total ?? -1;
	}

	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 14 });
	const organizer = await freshPage(browser);

	// Step 1: events A and B; two participants join A and mark 20:00.
	const a = await createEvent(organizer, "Zkouška kapely", first);
	const b = await createEvent(organizer, "Výlet", first);

	await respond(browser, a.share, "Jana", first, ["20:00"]);
	await respond(browser, a.share, "Petr", first, ["20:00"]);

	// Step 2: narrowing the hours names how many participants lose availability.
	await organizer.goto(a.admin);
	await expect(organizer.getByLabel("Délka políčka")).toBeDisabled();
	await organizer.getByLabel("do", { exact: true }).selectOption({ label: "19:00" });
	await organizer.getByRole("button", { name: "Uložit změny" }).click();
	await expect(
		organizer.getByRole("alert").filter({ hasText: "2 účastníci přijdou o část své dostupnosti" }),
	).toBeVisible();
	await organizer.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();

	const viewer = await freshPage(browser);

	await viewer.goto(a.share);
	await expect(cell(viewer, first, "18:30")).toBeVisible();
	await expect(cell(viewer, first, "19:00")).toHaveCount(0);
	await viewer.context().close();

	// Step 3: deleting a participant, then A. No row of A remains; responses go with
	// their participants.
	await organizer.getByRole("button", { name: "Smazat účastníka Jana" }).click();
	await organizer.getByRole("button", { name: "Smazat účastníka", exact: true }).click();
	await expect(organizer.getByRole("heading", { name: "Účastníci (1)" })).toBeVisible();
	await organizer.getByRole("button", { name: "Smazat událost" }).click();
	await organizer.getByRole("button", { name: "Smazat natrvalo" }).click();
	await organizer.waitForURL(/\/cs$/u);
	await expect(organizer.getByText("Zkouška kapely")).toHaveCount(0);
	await expectGone(organizer, a.share);
	await expectGone(organizer, a.admin);
	await expectGone(organizer, `${a.share}/created`);
	expect(
		await rows("select count(*)::int as total from events where id = $1", [idOf(a.share)]),
	).toBe(0);
	expect(
		await rows("select count(*)::int as total from participants where event_id = $1", [
			idOf(a.share),
		]),
	).toBe(0);

	// Step 4: B's dates move into the past, so its deletion date has passed. B is unknown at
	// once, and the purge command deletes it.
	await database.query(
		"update events set range_first = '2020-01-01', range_last = '2020-01-02' where id = $1",
		[idOf(b.share)],
	);
	await expectGone(organizer, b.share);
	await expectGone(organizer, `${b.share}/created`);
	expect(
		await rows("select count(*)::int as total from events where id = $1", [idOf(b.share)]),
	).toBe(1);

	execFileSync("node", [join(import.meta.dirname, "../scripts/purge.mts")], {
		env: { ...process.env, DATABASE_URL },
	});

	expect(
		await rows("select count(*)::int as total from events where id = $1", [idOf(b.share)]),
	).toBe(0);

	await organizer.context().close();
	await database.end();
});
