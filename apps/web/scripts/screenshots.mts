// Screenshots of every page in both languages, on a phone and a desktop, for a visual review.
// Run against a production build: `node scripts/screenshots.mts <base URL> <output folder>`.
// It fills a sample event through the API, so the instance must accept new events.

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { type Browser, chromium, type Page } from "@playwright/test";
import { z } from "zod";

const [baseUrl = "http://127.0.0.1:3500", outDir = "screenshots"] = process.argv.slice(2);

const viewports = [
	{ name: "phone", size: { width: 390, height: 844 }, touch: true },
	{ name: "desktop", size: { width: 1280, height: 900 }, touch: false },
] as const;

const locales = ["cs", "en"] as const;

const slotSchema = z.object({ start: z.string() });

type Slot = z.infer<typeof slotSchema>;

const createdSchema = z.object({
	event: z.object({ id: z.string(), schedule: z.object({ slots: z.array(slotSchema) }) }),
	adminSecret: z.string(),
});

const joinedSchema = z.object({ participantToken: z.string() });

type ApiRequest = { method: "POST" | "PUT"; path: string; json: string; token?: string };

async function send(request: ApiRequest): Promise<Response> {
	const headers = new Headers({ "content-type": "application/json" });

	if (request.token !== undefined) {
		headers.set("authorization", `Bearer ${request.token}`);
	}

	const response = await fetch(`${baseUrl}/api/v1${request.path}`, {
		method: request.method,
		headers,
		body: request.json,
	});

	if (!response.ok) {
		throw new Error(`${request.method} ${request.path} answered ${response.status}`);
	}

	return response;
}

type Sample = { id: string; adminSecret: string; viewerToken: string };

/** An evening event over three days with six people, so the heat map uses every step. */
async function sampleEvent(): Promise<Sample> {
	const first = Temporal.Now.plainDateISO("Europe/Prague").add({ days: 7 });

	const creation = await send({
		method: "POST",
		path: "/events",
		json: JSON.stringify({
			name: "Board game night",
			description: "Bring a game if you have one.",
			referenceZone: "Europe/Prague",
			schedule: {
				mode: "range",
				first: first.toString(),
				last: first.add({ days: 2 }).toString(),
				dailyStart: "17:00",
				dailyEnd: "22:00",
				slotMinutes: 30,
			},
		}),
	});

	const created = createdSchema.parse(await creation.json());

	const { id, schedule } = created.event;

	const perDay = schedule.slots.length / 3;

	// Each person takes a different run of each day, so the counts range from nobody to everyone.
	const people: Array<[string, (index: number) => boolean]> = [
		["Ada", (index) => index % perDay >= 2],
		["Bořek", (index) => index % perDay >= 3 && index % perDay < 9],
		["Cyril", (index) => index % perDay >= 4 && index < perDay * 2],
		["Dana", (index) => index % perDay >= 4 && index % perDay < 8],
		["Eva", (index) => index >= perDay && index % perDay >= 5],
		["Filip", (index) => index % perDay === 5 || index % perDay === 6],
	];

	const tokens = await Promise.all(
		people.map(async ([name, picks]) => {
			const joining = await send({
				method: "POST",
				path: `/events/${id}/participants`,
				json: JSON.stringify({ name }),
			});

			const joined = joinedSchema.parse(await joining.json());

			const availability: Slot[] = schedule.slots.filter((_, index) => picks(index));

			await send({
				method: "PUT",
				path: `/events/${id}/participants/me/availability`,
				json: JSON.stringify({ availability }),
				token: joined.participantToken,
			});

			return joined.participantToken;
		}),
	);

	// The viewer is the last person, Filip.
	const viewerToken = tokens.at(-1);

	if (viewerToken === undefined) {
		throw new Error("The sample event has no participants");
	}

	return { id, adminSecret: created.adminSecret, viewerToken };
}

type Viewport = (typeof viewports)[number];

async function newPage(
	browser: Browser,
	viewport: Viewport,
	locale: string,
	stored?: string,
): Promise<Page> {
	const context = await browser.newContext({
		viewport: viewport.size,
		hasTouch: viewport.touch,
		locale,
		timezoneId: "Europe/Prague",
	});

	if (stored !== undefined) {
		await context.addInitScript((value) => {
			localStorage.setItem("convenr.events", value);
		}, stored);
	}

	return context.newPage();
}

async function shoot(page: Page, name: string): Promise<void> {
	await page.waitForLoadState("networkidle");
	await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
}

async function main(): Promise<void> {
	await mkdir(outDir, { recursive: true });

	const sample = await sampleEvent();

	const segment = `board-game-night-${sample.id}`;

	// The browser of the last participant, so the event page opens already joined.
	const viewer = JSON.stringify({
		[sample.id]: {
			id: sample.id,
			name: "Board game night",
			segment,
			participant: { name: "Filip", token: sample.viewerToken },
		},
	});

	const browser = await chromium.launch();

	async function visit(viewport: Viewport, locale: string): Promise<void> {
		const prefix = `${viewport.name}-${locale}`;

		const visitor = await newPage(browser, viewport, locale);

		await visitor.goto(`${baseUrl}/${locale}`);
		await shoot(visitor, `${prefix}-01-start`);

		await visitor.goto(`${baseUrl}/${locale}/e/${segment}`);
		await visitor.getByRole("table").waitFor();
		await shoot(visitor, `${prefix}-02-event-group`);

		// A cell with keyboard focus, on one of the darkest heat steps.
		await visitor.getByRole("table").getByRole("button").nth(17).focus();
		await shoot(visitor, `${prefix}-03-event-focus`);

		// Leaving the grid closes the slot detail, which covers the list on a phone.
		await visitor.keyboard.press("Escape");
		await visitor.locator("ol button[aria-pressed]").first().click();
		await shoot(visitor, `${prefix}-04-event-best-window`);

		await visitor.goto(`${baseUrl}/${locale}/e/x-nonexistent00`);
		await shoot(visitor, `${prefix}-09-not-found`);

		await visitor.goto(`${baseUrl}/${locale}/api`);
		await shoot(visitor, `${prefix}-10-api-reference`);
		await visitor.context().close();

		const joined = await newPage(browser, viewport, locale, viewer);

		await joined.goto(`${baseUrl}/${locale}/e/${segment}`);
		await joined.getByRole("table").waitFor();
		await shoot(joined, `${prefix}-05-event-joined`);
		await joined.getByRole("tab").first().click();
		await shoot(joined, `${prefix}-06-event-me`);
		await joined.context().close();

		const organizer = await newPage(browser, viewport, locale);

		await organizer.goto(`${baseUrl}/${locale}/e/${segment}/manage#${sample.adminSecret}`);
		await organizer.getByRole("heading").first().waitFor();
		await shoot(organizer, `${prefix}-07-manage`);
		await organizer.context().close();
	}

	await Promise.all(
		viewports.flatMap((viewport) => locales.map((locale) => visit(viewport, locale))),
	);

	await browser.close();
	console.log(`Screenshots in ${outDir}; sample event ${sample.id}`);
}

await main();
