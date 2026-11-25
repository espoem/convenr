import { type APIRequestContext, type Page, test } from "@playwright/test";
import { z } from "zod";

import { eventIdFromSegment } from "../src/domain/event-address";
import { joinedSchema, optionSchema } from "../src/server/api/schemas";
import { expect, expectSteady, freshPage } from "./helpers";

test.setTimeout(180_000);

const ZONE = "Europe/Prague";

function eventId(share: string): string {
	const id = eventIdFromSegment(new URL(share).pathname.split("/").at(-1) ?? "");

	if (id === undefined) {
		throw new Error(`${share} is not an event address.`);
	}

	return id;
}

/** Adds an option on `date` from `start` to `end` in the create or manage form. */
async function addOption(page: Page, date: Temporal.PlainDate, start: string, end: string) {
	await page.getByLabel("Datum", { exact: true }).fill(date.toString());
	await page.getByLabel("Od", { exact: true }).fill(start);
	await page.getByLabel("Do", { exact: true }).fill(end);
	await page.getByRole("button", { name: "Přidat termín" }).click();
}

/** A participant who answers the options at `available` and `ifNeedBe`, by start, through the API. */
async function answer(
	request: APIRequestContext,
	share: string,
	name: string,
	levels: { available: string[]; ifNeedBe: string[] },
) {
	const id = eventId(share);

	const { schedule } = z
		.object({ schedule: z.object({ options: z.array(optionSchema) }) })
		.parse(await (await request.get(`/api/v1/events/${id}`)).json());

	const { options } = schedule;

	const byStart = (starts: string[]) =>
		starts.map((start) => {
			const found = options.find((option) =>
				Temporal.Instant.from(option.start).equals(Temporal.Instant.from(start)),
			);

			if (found === undefined) {
				throw new Error(`No option starts at ${start}.`);
			}

			return { option: found.id };
		});

	const joining = await request.post(`/api/v1/events/${id}/participants`, { data: { name } });

	expect(joining.ok()).toBe(true);

	const { participantToken } = joinedSchema.parse(await joining.json());

	const saving = await request.put(`/api/v1/events/${id}/participants/me/availability`, {
		headers: { Authorization: `Bearer ${participantToken}` },
		data: {
			availability: byStart([...levels.available, ...levels.ifNeedBe]),
			ifNeedBe: byStart(levels.ifNeedBe),
		},
	});

	expect(saving.ok()).toBe(true);
}

test("a poll is created, answered and finalized, and removing an answered option asks first", async ({
	browser,
	request,
}) => {
	const first = Temporal.Now.plainDateISO(ZONE).add({ days: 10 });
	const second = first.add({ days: 1 });

	const at = (date: Temporal.PlainDate, time: string) =>
		date.toZonedDateTime({ timeZone: ZONE, plainTime: time }).toInstant().toString();

	// The organizer works on a wide screen, where the options are a table.
	const context = await browser.newContext({ locale: "cs-CZ", timezoneId: ZONE });
	const organizer = await context.newPage();

	await organizer.goto("/cs");
	await organizer.getByLabel("Název").fill("Anketa o termín");
	await organizer.getByRole("button", { name: /^Pár vybraných termínů/u }).click();
	await addOption(organizer, first, "18:00", "20:00");
	await addOption(organizer, second, "19:00", "21:00");
	await expect(organizer.getByText("2 z nejvýš 20 termínů.")).toBeVisible();
	await organizer.getByRole("button", { name: "Vytvořit událost" }).click();
	await organizer.waitForURL(/\/created$/u);

	const share = await organizer.getByLabel("Odkaz pro účastníky").inputValue();
	const admin = await organizer.getByLabel("Odkaz pro správu").inputValue();

	await answer(request, share, "Jana", { available: [at(first, "18:00")], ifNeedBe: [] });

	// A participant on a phone answers, where each option is a card.
	const eva = await freshPage(browser);

	await eva.goto(share);
	await expect(eva.getByRole("table", { name: "Termíny" })).toBeVisible();
	await eva.getByLabel("Vaše jméno").fill("Eva");
	await eva.getByRole("button", { name: "Pokračovat" }).click();

	const firstAnswer = eva.getByRole("group", { name: /^Vaše odpověď na .*18:00–20:00$/u });

	await expect(firstAnswer).toBeVisible();
	await expectSteady(firstAnswer.getByRole("button"), () =>
		firstAnswer.getByRole("button", { name: "Když bude nutné" }).click(),
	);
	await expect(firstAnswer.getByRole("button", { name: "Když bude nutné" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await eva.getByRole("button", { name: "Uložit" }).click();
	await expect(eva.getByText("Uloženo.")).toBeVisible();

	const firstRow = eva.getByRole("row", { name: /18:00–20:00/u });

	await expect(firstRow).toContainText("2 z 2, z toho 1 když bude nutné");
	await expect(firstRow).not.toContainText("skóre");
	await expect(firstRow).toContainText("Můžou: Jana");
	await expect(firstRow).toContainText("Když bude nutné: Eva");
	await expect(
		eva.getByRole("region", { name: "Nejlepší časy" }).getByRole("listitem").first(),
	).toContainText("Jana a Eva (když bude nutné)");

	// The organizer picks the first option as the final time.
	await organizer.goto(admin);
	await organizer
		.getByRole("button", { name: /^Vybrat .*18:00–20:00 jako výsledný čas$/u })
		.click();
	await expect(organizer.getByText(/^Výsledný čas je .*18:00–20:00\.$/u)).toBeVisible();

	await eva.reload();
	await expect(eva.getByRole("region", { name: "Výsledný čas" })).toContainText("18:00–20:00");

	// A third option, then the answered first one removed: the change says what it costs.
	await addOption(organizer, second, "10:00", "11:30");
	await organizer.getByRole("button", { name: /^Odebrat .*18:00–20:00$/u }).click();
	await organizer.getByRole("button", { name: "Uložit změny" }).click();

	const confirm = organizer.getByRole("alert").filter({ hasText: "Uložit a odebrat" });

	await expect(confirm).toContainText("2 účastníci přijdou o odpověď");
	await expect(confirm).toContainText("takže se výsledný čas zruší");
	await confirm.getByRole("button", { name: "Uložit a odebrat" }).click();
	await expect(organizer.getByText("Změny jsou uložené.")).toBeVisible();
	await expect(organizer.getByText("Výsledný čas zatím není vybraný.")).toBeVisible();
	await expect(organizer.getByRole("row", { name: /10:00–11:30/u })).toBeVisible();
	await expect(organizer.getByRole("row", { name: /18:00–20:00/u })).toHaveCount(0);

	await context.close();
	await eva.context().close();
});
