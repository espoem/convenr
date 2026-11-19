import {
	type APIRequestContext,
	type Browser,
	expect as baseExpect,
	type Locator,
	type Page,
} from "@playwright/test";

import { eventIdFromSegment } from "../src/domain/event-address";
import { joinedSchema } from "../src/server/api/schemas";

// Several browsers in one test, next to the other tests' browsers, can take far longer than the
// default 5 seconds on a busy machine: joins and saves took over 15 seconds at a load of 50.
export const expect = baseExpect.configure({ timeout: 45_000 });

/** A browser of its own, so that local storage and the joined participant stay apart. */
export async function freshPage(browser: Browser, timezoneId = "Europe/Prague"): Promise<Page> {
	const context = await browser.newContext({
		locale: "cs-CZ",
		timezoneId,
		viewport: { width: 390, height: 844 },
		hasTouch: true,
	});

	return context.newPage();
}

/**
 * A grid cell. Its accessible name starts with the day as the Czech page writes it, like a
 * best window's button below the grid, so the search stays inside the grid.
 */
export function cell(page: Page, date: Temporal.PlainDate, start: string) {
	const day = date.toLocaleString("cs", { weekday: "long", day: "numeric", month: "long" });

	return page
		.getByRole("table")
		.getByRole("button", { name: new RegExp(`^${day}, ${start}–`, "u") });
}

/** Creates a two-day event in Prague from 17:00 to 21:00 and returns its two links. */
export async function createEvent(page: Page, name: string, first: Temporal.PlainDate) {
	await page.goto("/cs");
	await page.getByLabel("Název").fill(name);
	await page.getByText("Dny po sobě").click();
	await page.getByLabel("První den").fill(first.toString());
	await page.getByLabel("Poslední den").fill(first.add({ days: 1 }).toString());
	await page.getByLabel("Každý den od").selectOption({ label: "17:00" });
	await page.getByLabel("do", { exact: true }).selectOption({ label: "21:00" });
	await page.getByRole("button", { name: "Vytvořit událost" }).click();
	await page.waitForURL(/\/created$/u);

	return {
		share: await page.getByLabel("Odkaz pro účastníky").inputValue(),
		admin: await page.getByLabel("Odkaz pro správu").inputValue(),
	};
}

/**
 * Runs `act` and checks that no element of `group` moved or changed size: a control that
 * changes state, such as a pressed brush or a selected tab, must not shift the layout.
 */
export async function expectSteady(group: Locator, act: () => Promise<void>): Promise<void> {
	const boxes = () =>
		group.evaluateAll((elements) =>
			elements.map((element) => {
				// Page coordinates: a click may scroll its target into view first.
				const { x, y, width, height } = element.getBoundingClientRect();

				return { x: x + window.scrollX, y: y + window.scrollY, width, height };
			}),
		);

	const before = await boxes();

	await act();
	expect(await boxes()).toEqual(before);
}

/** Marks cells one at a time: each click must land before the next one counts. */
export async function mark(page: Page, date: Temporal.PlainDate, starts: string[]): Promise<void> {
	const [start, ...rest] = starts;

	if (start === undefined) {
		return;
	}

	await cell(page, date, start).click();
	await expect(cell(page, date, start)).toHaveAttribute("aria-pressed", "true");
	await mark(page, date, rest);
}

/** A participant in a fresh browser who has joined and sees their own grid. */
export async function joinAs(browser: Browser, share: string, name: string): Promise<Page> {
	const page = await freshPage(browser);

	await joinIn(page, share, name);

	return page;
}

/** Joins in `page`, which may have its clock installed first. */
export async function joinIn(page: Page, share: string, name: string): Promise<void> {
	await page.goto(share);
	// A dated grid appears only after hydration; a click before it would be lost.
	await expect(page.getByRole("table")).toBeVisible();
	await page.getByLabel("Vaše jméno").fill(name);
	await page.getByRole("button", { name: "Pokračovat" }).click();
	await expect(page.getByRole("tab", { name: "Já" })).toHaveAttribute("aria-selected", "true");
}

/**
 * A participant who joins and saves the slots starting at `starts`, in Prague time, through
 * the API. Tests whose subject is not the response itself set the group up this way, so they
 * start no browser per participant; joining and painting in the page are tested on their own.
 */
export async function respond(
	request: APIRequestContext,
	share: string,
	name: string,
	date: Temporal.PlainDate,
	starts: string[],
): Promise<void> {
	const id = eventIdFromSegment(new URL(share).pathname.split("/").at(-1) ?? "");

	if (id === undefined) {
		throw new Error(`${share} is not an event address.`);
	}

	const joining = await request.post(`/api/v1/events/${id}/participants`, { data: { name } });

	expect(joining.ok()).toBe(true);

	const { participantToken } = joinedSchema.parse(await joining.json());

	const availability = starts.map((start) => ({
		start: date
			.toZonedDateTime({ timeZone: "Europe/Prague", plainTime: start })
			.toInstant()
			.toString(),
	}));

	const saving = await request.put(`/api/v1/events/${id}/participants/me/availability`, {
		headers: { Authorization: `Bearer ${participantToken}` },
		data: { availability },
	});

	expect(saving.ok()).toBe(true);
}
