// Runs Lighthouse and scripted INP benchmarks against the standalone production build on a
// seeded database (`mise run vitals`). Needs `mise run build` and PostgreSQL.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { chromium, type Cookie } from "@playwright/test";
import lighthouse, { desktopConfig, type Flags } from "lighthouse";
import { Client } from "pg";
import { Temporal } from "temporal-polyfill";
import { z } from "zod";

type Profile = "phone" | "desktop";

type LhrResult = NonNullable<Awaited<ReturnType<typeof lighthouse>>>["lhr"];

type PageTarget = {
	name: string;
	path: string;
	indexable: boolean;
	cookieHeader?: string;
	inpFlow?: "start" | "dated-grid-joined";
};

type AuditSummary = {
	id: string;
	title: string;
	score: number;
	displayValue: string;
};

type LighthouseRun = {
	performance: number;
	accessibility: number;
	bestPractices: number;
	seo: number;
	cls: number;
	lcpMs: number;
	tbtMs: number;
	failingAudits: AuditSummary[];
};

type BenchmarkSummary = {
	page: string;
	path: string;
	profile: Profile;
	indexable: boolean;
	passed: boolean;
	performance: number;
	accessibility: number;
	bestPractices: number;
	seo: number;
	cls: number;
	lcpMs: number;
	tbtMs: number;
	inpMs: number | null;
	failures: string[];
	failingAudits: AuditSummary[];
};

type SeededTargets = {
	pages: PageTarget[];
	joinedCookie: Cookie;
};

type BenchmarkJob = {
	target: PageTarget;
	profile: Profile;
};

const THRESHOLDS = {
	desktop: { performance: 98, score: 100, cls: 0, lcpMs: 1200, inpMs: 100 },
	phone: { performance: 98, score: 100, cls: 0, lcpMs: 1800, inpMs: 200 },
} as const;

const ZONE = "Europe/Prague";
const REPOSITORY = join(import.meta.dirname, "../../..");
const REPORT_DIR = join(REPOSITORY, "apps/web/vitals-report");

const DATABASE_URL =
	process.env["VITALS_DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr_vitals";

const PORT = process.env["VITALS_PORT"] ?? "3600";
const INSTANCE = `http://127.0.0.1:${PORT}`;
const RUNS = Math.max(1, Number(process.env["VITALS_RUNS"] ?? "3"));
const CONCURRENCY = Math.max(1, Number(process.env["VITALS_CONCURRENCY"] ?? "3"));

const portAddressSchema = z.object({ port: z.number() });

const createdSchema = z.object({
	event: z.object({
		id: z.string(),
		name: z.string(),
		schedule: z.object({
			options: z.array(z.object({ id: z.string(), start: z.string() })).optional(),
		}),
	}),
});

const joinedSchema = z.object({ participantToken: z.string() });

const inpEntriesSchema = z.array(
	z.object({ name: z.string(), duration: z.number(), interactionId: z.number() }),
);

const cookieSchema = z.object({
	name: z.string(),
	value: z.string(),
	domain: z.string(),
	path: z.string(),
	expires: z.number(),
	httpOnly: z.boolean(),
	secure: z.boolean(),
	sameSite: z.enum(["Strict", "Lax", "None"]),
});

const workerPayloadSchema = z.object({
	target: z.object({
		name: z.string(),
		path: z.string(),
		indexable: z.boolean(),
		cookieHeader: z.string().optional(),
		inpFlow: z.enum(["start", "dated-grid-joined"]).optional(),
	}),
	profile: z.enum(["phone", "desktop"]),
	chromePath: z.string(),
	joinedCookie: cookieSchema,
});

const benchmarkSummarySchema = z.object({
	page: z.string(),
	path: z.string(),
	profile: z.enum(["phone", "desktop"]),
	indexable: z.boolean(),
	passed: z.boolean(),
	performance: z.number(),
	accessibility: z.number(),
	bestPractices: z.number(),
	seo: z.number(),
	cls: z.number(),
	lcpMs: z.number(),
	tbtMs: z.number(),
	inpMs: z.number().nullable(),
	failures: z.array(z.string()),
	failingAudits: z.array(
		z.object({
			id: z.string(),
			title: z.string(),
			score: z.number(),
			displayValue: z.string(),
		}),
	),
});

function slugifyName(value: string): string {
	return value
		.normalize("NFKD")
		.replaceAll(/[\u0300-\u036F]/gu, "")
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/gu, "-")
		.replaceAll(/^-|-$/gu, "");
}

function segmentOf(id: string, name: string): string {
	const slug = slugifyName(name);

	return slug === "" ? id : `${slug}-${id}`;
}

async function recreateDatabase(url: string): Promise<void> {
	const target = new URL(url);
	const name = target.pathname.slice(1);

	if (!/^\w+_vitals$/u.test(name)) {
		throw new Error(`Refusing to recreate "${name}": the vitals database name ends in _vitals.`);
	}

	target.pathname = "/postgres";

	const server = new Client({ connectionString: target.toString() });

	await server.connect();

	try {
		await server.query(`drop database if exists "${name}" with (force)`);
		await server.query(`create database "${name}"`);
	} finally {
		await server.end();
	}
}

async function healthy(): Promise<boolean> {
	try {
		const response = await fetch(`${INSTANCE}/api/health`, { signal: AbortSignal.timeout(2000) });

		return response.ok;
	} catch {
		return false;
	}
}

async function waitUntilHealthy(deadline: number, exited: () => string | undefined): Promise<void> {
	const exitReason = exited();

	if (exitReason !== undefined) {
		throw new Error(`The server at ${INSTANCE} exited before becoming healthy (${exitReason}).`);
	}

	if (await healthy()) {
		return;
	}

	if (performance.now() > deadline) {
		throw new Error(`The server at ${INSTANCE} did not become healthy in time.`);
	}

	await sleep(250);

	return waitUntilHealthy(deadline, exited);
}

async function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();

		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const parsed = portAddressSchema.safeParse(server.address());

			if (!parsed.success) {
				server.close();
				reject(new Error("Could not allocate an ephemeral port."));

				return;
			}

			const { port } = parsed.data;

			server.close(() => resolve(port));
		});
	});
}

async function waitForDebugger(debugPort: number, deadline: number): Promise<void> {
	try {
		const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, {
			signal: AbortSignal.timeout(1000),
		});

		if (response.ok) {
			return;
		}
	} catch {
		// Browser is still starting up.
	}

	if (performance.now() > deadline) {
		throw new Error(`Chrome DevTools did not respond on port ${debugPort}.`);
	}

	await sleep(100);

	return waitForDebugger(debugPort, deadline);
}

async function postJson(path: string, jsonBody: string, token?: string): Promise<string> {
	const headers = new Headers({ "Content-Type": "application/json" });

	if (token !== undefined) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(`${INSTANCE}${path}`, {
		method: "POST",
		headers,
		body: jsonBody,
	});

	const text = await response.text();

	if (!response.ok) {
		throw new Error(`POST ${path} failed with ${response.status}: ${text}`);
	}

	return text;
}

async function putJson(path: string, jsonBody: string, token: string): Promise<void> {
	const response = await fetch(`${INSTANCE}${path}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: jsonBody,
	});

	if (!response.ok) {
		throw new Error(`PUT ${path} failed with ${response.status}: ${await response.text()}`);
	}
}

type DatedSlot = { start: string };

type WeekdaySlot = { weekday: number; minute: number };

type OptionSlot = { option: string };

type SeedSlot = DatedSlot | WeekdaySlot | OptionSlot;

type SeedParticipant = {
	name: string;
	availability: SeedSlot[];
	ifNeedBe?: SeedSlot[];
};

async function seedGridParticipants(
	eventId: string,
	entries: readonly SeedParticipant[],
	index = 0,
): Promise<void> {
	const entry = entries[index];

	if (entry === undefined) {
		return;
	}

	const joined = joinedSchema.parse(
		JSON.parse(
			await postJson(
				`/api/v1/events/${eventId}/participants`,
				JSON.stringify({ name: entry.name }),
			),
		),
	);

	await putJson(
		`/api/v1/events/${eventId}/participants/me/availability`,
		JSON.stringify({ availability: entry.availability, ifNeedBe: entry.ifNeedBe }),
		joined.participantToken,
	);

	return seedGridParticipants(eventId, entries, index + 1);
}

async function seedJoinedCookie(datedSegment: string): Promise<Cookie> {
	const browser = await chromium.launch({
		headless: true,
		env: { ...process.env, TZ: ZONE },
	});

	try {
		const context = await browser.newContext({
			locale: "en-US",
			timezoneId: ZONE,
			viewport: { width: 1280, height: 800 },
		});

		const page = await context.newPage();

		await page.goto(`${INSTANCE}/en/e/${datedSegment}`);
		await page.getByRole("table").waitFor({ state: "visible" });
		await page.getByLabel("Your name").fill("Eva");
		await page.getByRole("button", { name: "Continue" }).click();
		await page.locator('[role="tab"][aria-selected="true"]', { hasText: "Me" }).waitFor();

		const cells = page.locator(".cv-cell-button");

		await cells.nth(0).click();
		await cells.nth(1).click();
		await cells.nth(2).click();
		await page.getByRole("button", { name: "Save" }).click();
		await page.getByText("Saved.").waitFor({ state: "visible" });

		const cookies = await context.cookies(INSTANCE);
		const found = cookies.find((cookie) => cookie.name.endsWith("convenr-key"));

		if (found === undefined) {
			throw new Error("Could not capture browser key cookie after joining.");
		}

		return found;
	} finally {
		await browser.close();
	}
}

async function seedPages(): Promise<SeededTargets> {
	const first = Temporal.Now.plainDateISO(ZONE).add({ days: 14 });

	const slotAt = (dayOffset: number, time: string): DatedSlot => ({
		start: first
			.add({ days: dayOffset })
			.toZonedDateTime({ timeZone: ZONE, plainTime: time })
			.toInstant()
			.toString(),
	});

	const datedCreated = createdSchema.parse(
		JSON.parse(
			await postJson(
				"/api/v1/events",
				JSON.stringify({
					name: "Vitals Team Grid",
					description: "Weekly planning overlap for the team.",
					referenceZone: ZONE,
					firstDayOfWeek: 1,
					schedule: {
						mode: "range",
						first: first.toString(),
						last: first.add({ days: 4 }).toString(),
						dailyStart: "17:00",
						dailyEnd: "21:00",
						slotMinutes: 30,
					},
				}),
			),
		),
	);

	await seedGridParticipants(datedCreated.event.id, [
		{ name: "Alice", availability: [slotAt(0, "18:00"), slotAt(0, "18:30"), slotAt(1, "18:00")] },
		{
			name: "Bob",
			availability: [slotAt(0, "18:00"), slotAt(0, "18:30"), slotAt(1, "18:30")],
			ifNeedBe: [slotAt(1, "18:30")],
		},
		{ name: "Clara", availability: [slotAt(0, "18:00"), slotAt(0, "18:30"), slotAt(2, "19:00")] },
		{ name: "David", availability: [slotAt(0, "18:00"), slotAt(0, "18:30"), slotAt(0, "19:00")] },
		{ name: "Frank", availability: [slotAt(0, "18:00"), slotAt(0, "18:30")] },
		{
			name: "Grace",
			availability: [slotAt(0, "18:00"), slotAt(0, "18:30"), slotAt(3, "17:30")],
			ifNeedBe: [slotAt(0, "18:30")],
		},
	]);

	const datedSegment = segmentOf(datedCreated.event.id, datedCreated.event.name);
	const joinedCookie = await seedJoinedCookie(datedSegment);

	const weekdayCreated = createdSchema.parse(
		JSON.parse(
			await postJson(
				"/api/v1/events",
				JSON.stringify({
					name: "Vitals Weekly Practice",
					referenceZone: ZONE,
					firstDayOfWeek: 1,
					schedule: {
						mode: "weekdays",
						weekdays: [1, 2, 3, 4, 5],
						dailyStart: "17:00",
						dailyEnd: "21:00",
						slotMinutes: 30,
					},
				}),
			),
		),
	);

	await seedGridParticipants(weekdayCreated.event.id, [
		{
			name: "Alice",
			availability: [
				{ weekday: 1, minute: 1080 },
				{ weekday: 1, minute: 1110 },
			],
		},
		{
			name: "Bob",
			availability: [
				{ weekday: 1, minute: 1080 },
				{ weekday: 2, minute: 1080 },
			],
		},
		{
			name: "Clara",
			availability: [
				{ weekday: 1, minute: 1080 },
				{ weekday: 1, minute: 1110 },
			],
			ifNeedBe: [{ weekday: 1, minute: 1110 }],
		},
		{ name: "David", availability: [{ weekday: 1, minute: 1080 }] },
		{
			name: "Frank",
			availability: [
				{ weekday: 1, minute: 1080 },
				{ weekday: 3, minute: 1140 },
			],
		},
	]);

	const weekdaySegment = segmentOf(weekdayCreated.event.id, weekdayCreated.event.name);

	const pollCreated = createdSchema.parse(
		JSON.parse(
			await postJson(
				"/api/v1/events",
				JSON.stringify({
					name: "Vitals Dinner Poll",
					referenceZone: ZONE,
					schedule: {
						mode: "poll",
						options: [
							{ start: slotAt(0, "18:00").start, end: slotAt(0, "20:00").start },
							{ start: slotAt(1, "18:00").start, end: slotAt(1, "20:00").start },
							{ start: slotAt(2, "18:00").start, end: slotAt(2, "20:00").start },
							{ start: slotAt(3, "18:00").start, end: slotAt(3, "20:00").start },
							{ start: slotAt(4, "18:00").start, end: slotAt(4, "20:00").start },
						],
					},
				}),
			),
		),
	);

	const pollOptions = pollCreated.event.schedule.options ?? [];

	if (pollOptions.length < 3) {
		throw new Error("Expected at least 3 seeded poll options.");
	}

	const option0 = { option: pollOptions[0]?.id ?? "" };
	const option1 = { option: pollOptions[1]?.id ?? "" };
	const option2 = { option: pollOptions[2]?.id ?? "" };

	await seedGridParticipants(pollCreated.event.id, [
		{ name: "Alice", availability: [option0, option1] },
		{ name: "Bob", availability: [option0, option2], ifNeedBe: [option2] },
		{ name: "Clara", availability: [option0, option1] },
		{ name: "David", availability: [option0] },
		{ name: "Frank", availability: [option0, option1], ifNeedBe: [option1] },
		{ name: "Grace", availability: [option0, option2] },
	]);

	const pollSegment = segmentOf(pollCreated.event.id, pollCreated.event.name);

	return {
		joinedCookie,
		pages: [
			{ name: "start", path: "/en", indexable: true, inpFlow: "start" },
			{ name: "dated-grid", path: `/en/e/${datedSegment}`, indexable: false },
			{
				name: "dated-grid-joined",
				path: `/en/e/${datedSegment}`,
				indexable: false,
				cookieHeader: `${joinedCookie.name}=${joinedCookie.value}`,
				inpFlow: "dated-grid-joined",
			},
			{ name: "weekday-grid", path: `/en/e/${weekdaySegment}`, indexable: false },
			{ name: "poll", path: `/en/e/${pollSegment}`, indexable: false },
			{ name: "api", path: "/en/api", indexable: true },
			{ name: "privacy", path: "/en/privacy", indexable: true },
			{ name: "sign-in", path: "/en/sign-in", indexable: false },
		],
	};
}

function categoryPercent(lhr: LhrResult, id: string): number {
	const score = lhr.categories[id]?.score;

	return score === null || score === undefined ? 0 : Math.round(score * 100);
}

function seoScoreForTarget(lhr: LhrResult, indexable: boolean): number {
	if (indexable) {
		return categoryPercent(lhr, "seo");
	}

	const seoCategory = lhr.categories["seo"];

	if (seoCategory === undefined) {
		return 0;
	}

	let weightedSum = 0;
	let totalWeight = 0;

	for (const ref of seoCategory.auditRefs) {
		if (ref.id === "is-crawlable" || ref.weight <= 0) {
			continue;
		}

		const audit = lhr.audits[ref.id];

		if (audit?.score === null || audit?.score === undefined) {
			continue;
		}

		weightedSum += audit.score * ref.weight;
		totalWeight += ref.weight;
	}

	return totalWeight === 0 ? 100 : Math.round((weightedSum / totalWeight) * 100);
}

function collectFailingAudits(lhr: LhrResult, indexable: boolean): AuditSummary[] {
	const failing: AuditSummary[] = [];
	const seen = new Set<string>();

	for (const categoryId of ["performance", "accessibility", "best-practices", "seo"]) {
		const category = lhr.categories[categoryId];

		if (category === undefined) {
			continue;
		}

		for (const ref of category.auditRefs) {
			if ((!indexable && ref.id === "is-crawlable") || seen.has(ref.id)) {
				continue;
			}

			const audit = lhr.audits[ref.id];

			if (audit === undefined || audit.score === null || audit.score >= 1) {
				continue;
			}

			seen.add(ref.id);
			failing.push({
				id: ref.id,
				title: audit.title,
				score: Math.round(audit.score * 100),
				displayValue: audit.displayValue ?? "",
			});
		}
	}

	return failing;
}

function extractLighthouseRun(lhr: LhrResult, indexable: boolean): LighthouseRun {
	if (lhr.runtimeError !== undefined) {
		throw new Error(
			`Lighthouse runtime error (${lhr.runtimeError.code}): ${lhr.runtimeError.message}`,
		);
	}

	return {
		performance: categoryPercent(lhr, "performance"),
		accessibility: categoryPercent(lhr, "accessibility"),
		bestPractices: categoryPercent(lhr, "best-practices"),
		seo: seoScoreForTarget(lhr, indexable),
		cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0,
		lcpMs: lhr.audits["largest-contentful-paint"]?.numericValue ?? 0,
		tbtMs: lhr.audits["total-blocking-time"]?.numericValue ?? 0,
		failingAudits: collectFailingAudits(lhr, indexable),
	};
}

async function runLighthousePass(
	target: PageTarget,
	profile: Profile,
	debugPort: number,
): Promise<LighthouseRun> {
	const flags: Flags = {
		port: debugPort,
		logLevel: "error",
		output: "json",
		onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
	};

	if (target.cookieHeader !== undefined) {
		flags.extraHeaders = { Cookie: target.cookieHeader };
	}

	const result = await lighthouse(
		`${INSTANCE}${target.path}`,
		flags,
		profile === "desktop" ? desktopConfig : undefined,
	);

	if (result === undefined) {
		throw new Error(`Lighthouse returned no result for ${target.name} (${profile}).`);
	}

	return extractLighthouseRun(result.lhr, target.indexable);
}

async function collectLighthouseSeries(
	target: PageTarget,
	profile: Profile,
	debugPort: number,
	remaining: number,
	acc: LighthouseRun[],
): Promise<LighthouseRun[]> {
	if (remaining === 0) {
		return acc;
	}

	const run = await runLighthousePass(target, profile, debugPort);

	return collectLighthouseSeries(target, profile, debugPort, remaining - 1, [...acc, run]);
}

async function runLighthouseWithWarmup(
	target: PageTarget,
	profile: Profile,
	chromePath: string,
): Promise<LighthouseRun[]> {
	const debugPort = await freePort();
	const userDataDir = mkdtempSync(join(tmpdir(), "convenr-vitals-"));

	const chrome = spawn(
		chromePath,
		[
			"--headless=new",
			"--no-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			`--remote-debugging-port=${debugPort}`,
			`--user-data-dir=${userDataDir}`,
		],
		{ stdio: "ignore", env: { ...process.env, TZ: ZONE } },
	);

	try {
		await waitForDebugger(debugPort, performance.now() + 15_000);
		// One warmup run is discarded before taking the median of measured runs.
		await runLighthousePass(target, profile, debugPort);

		return await collectLighthouseSeries(target, profile, debugPort, RUNS, []);
	} finally {
		chrome.kill("SIGKILL");
		rmSync(userDataDir, { recursive: true, force: true });
	}
}

function median(values: number[]): number {
	const sorted = values.toSorted((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);

	if (sorted.length === 0) {
		return 0;
	}

	return sorted.length % 2 === 1
		? (sorted[middle] ?? 0)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

async function runScriptedInpOnce(
	target: PageTarget,
	profile: Profile,
	joinedCookie: Cookie,
): Promise<number> {
	const browser = await chromium.launch({
		headless: true,
		env: { ...process.env, TZ: ZONE },
	});

	try {
		const context = await browser.newContext({
			locale: "en-US",
			timezoneId: ZONE,
			viewport: profile === "phone" ? { width: 390, height: 844 } : { width: 1350, height: 940 },
			hasTouch: profile === "phone",
		});

		if (target.cookieHeader !== undefined) {
			await context.addCookies([joinedCookie]);
		}

		await context.addInitScript(`
			window.vitalsEvents = [];
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					const interactionId = "interactionId" in entry ? Number(entry.interactionId) : 0;
					if (interactionId > 0) {
						window.vitalsEvents.push({
							name: entry.name,
							duration: entry.duration,
							interactionId,
						});
					}
				}
			}).observe({ type: "event", buffered: true, durationThreshold: 0 });
		`);

		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);

		if (profile === "phone") {
			await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
		}

		await page.goto(`${INSTANCE}${target.path}`);

		if (target.inpFlow === "start") {
			const pollKind = page.getByRole("button", { name: /^A few chosen times/u });
			const gridKind = page.getByRole("button", { name: /^A grid of days and times/u });

			await pollKind.waitFor({ state: "visible" });
			await pollKind.click();
			await gridKind.click();
			await page.getByRole("button", { name: "Next month" }).waitFor({ state: "visible" });

			const enabledDay = page.locator("button[aria-pressed]:not(:disabled)").nth(2);

			await enabledDay.click();
			await page.getByRole("radio", { name: "Consecutive days" }).click();
			await page.getByRole("radio", { name: "Chosen dates" }).click();
		} else {
			const meTab = page.getByRole("tab", { name: "Me" });
			const groupTab = page.getByRole("tab", { name: "Group" });

			await meTab.waitFor({ state: "visible" });

			const cells = page.locator(".cv-cell-button");

			await cells.nth(3).click();
			await cells.nth(4).click();
			await cells.nth(5).click();
			await page.getByRole("button", { name: "Discard changes" }).click();
			await groupTab.click();

			const minDuration = page.getByLabel("At least", { exact: true });

			await minDuration.waitFor({ state: "visible" });

			if ((await minDuration.locator("option").count()) > 1) {
				await minDuration.selectOption({ index: 1 });
				await minDuration.selectOption({ index: 0 });
			}

			await meTab.click();
		}

		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => {
							setTimeout(resolve, 60);
						});
					});
				}),
		);

		const entries = inpEntriesSchema.parse(await page.evaluate("window.vitalsEvents ?? []"));

		let worst = 0;

		for (const entry of entries) {
			if (entry.duration > worst) {
				worst = entry.duration;
			}
		}

		return worst;
	} finally {
		await browser.close();
	}
}

async function collectInpSeries(
	target: PageTarget,
	profile: Profile,
	joinedCookie: Cookie,
	remaining: number,
	acc: number[],
): Promise<number[]> {
	if (remaining === 0) {
		return acc;
	}

	const duration = await runScriptedInpOnce(target, profile, joinedCookie);

	return collectInpSeries(target, profile, joinedCookie, remaining - 1, [...acc, duration]);
}

function evaluateSummary(
	target: PageTarget,
	profile: Profile,
	series: LighthouseRun[],
	inpMs: number | null,
): BenchmarkSummary {
	const performanceScore = Math.round(median(series.map((run) => run.performance)));
	const accessibilityScore = Math.round(median(series.map((run) => run.accessibility)));
	const bestPracticesScore = Math.round(median(series.map((run) => run.bestPractices)));
	const seoScore = Math.round(median(series.map((run) => run.seo)));
	const cls = Number(median(series.map((run) => run.cls)).toFixed(4));
	const lcpMs = Math.round(median(series.map((run) => run.lcpMs)));
	const tbtMs = Math.round(median(series.map((run) => run.tbtMs)));
	const roundedInp = inpMs === null ? null : Math.round(inpMs);
	const limit = THRESHOLDS[profile];
	const failures: string[] = [];

	if (performanceScore < limit.performance) {
		failures.push(`Performance ${performanceScore} < ${limit.performance}`);
	}

	if (accessibilityScore < limit.score) {
		failures.push(`Accessibility ${accessibilityScore} < ${limit.score}`);
	}

	if (bestPracticesScore < limit.score) {
		failures.push(`Best Practices ${bestPracticesScore} < ${limit.score}`);
	}

	if (seoScore < limit.score) {
		failures.push(`SEO ${seoScore} < ${limit.score}`);
	}

	if (cls > limit.cls) {
		failures.push(`CLS ${cls} > ${limit.cls}`);
	}

	if (lcpMs > limit.lcpMs) {
		failures.push(`LCP ${lcpMs} ms > ${limit.lcpMs} ms`);
	}

	if (roundedInp !== null && roundedInp > limit.inpMs) {
		failures.push(`INP ${roundedInp} ms > ${limit.inpMs} ms`);
	}

	const auditMap = new Map<string, AuditSummary>();

	for (const run of series) {
		for (const audit of run.failingAudits) {
			const existing = auditMap.get(audit.id);

			if (existing === undefined || audit.score < existing.score) {
				auditMap.set(audit.id, audit);
			}
		}
	}

	return {
		page: target.name,
		path: target.path,
		profile,
		indexable: target.indexable,
		passed: failures.length === 0,
		performance: performanceScore,
		accessibility: accessibilityScore,
		bestPractices: bestPracticesScore,
		seo: seoScore,
		cls,
		lcpMs,
		tbtMs,
		inpMs: roundedInp,
		failures,
		failingAudits: [...auditMap.values()],
	};
}

async function auditOneJob(
	target: PageTarget,
	profile: Profile,
	chromePath: string,
	joinedCookie: Cookie,
): Promise<BenchmarkSummary> {
	const lhSeries = await runLighthouseWithWarmup(target, profile, chromePath);
	let inpMs: number | null = null;

	if (target.inpFlow !== undefined) {
		await runScriptedInpOnce(target, profile, joinedCookie);

		const inpSeries = await collectInpSeries(target, profile, joinedCookie, RUNS, []);

		inpMs = median(inpSeries);
	}

	return evaluateSummary(target, profile, lhSeries, inpMs);
}

async function runJobInProcess(
	job: BenchmarkJob,
	chromePath: string,
	joinedCookie: Cookie,
): Promise<BenchmarkSummary> {
	// Each Lighthouse run uses process-global performance marks, so parallel jobs run in child
	// Node processes to keep their measurement timelines isolated.
	const payload = JSON.stringify({
		target: job.target,
		profile: job.profile,
		chromePath,
		joinedCookie,
	});

	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [import.meta.filename, "--worker", payload], {
			stdio: ["ignore", "pipe", "pipe"],
			env: process.env,
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code !== 0) {
				reject(
					new Error(
						`Worker for ${job.target.name} (${job.profile}) exited ${String(code)}: ${stderr}`,
					),
				);

				return;
			}

			try {
				const lastLine = stdout.trim().split("\n").at(-1) ?? "";

				resolve(benchmarkSummarySchema.parse(JSON.parse(lastLine)));
			} catch (error) {
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	});
}

async function runWorker(
	jobs: readonly BenchmarkJob[],
	results: Array<BenchmarkSummary | undefined>,
	nextIndex: () => number,
	chromePath: string,
	joinedCookie: Cookie,
): Promise<void> {
	const index = nextIndex();
	const job = jobs[index];

	if (job === undefined) {
		return;
	}

	results[index] = await runJobInProcess(job, chromePath, joinedCookie);

	return runWorker(jobs, results, nextIndex, chromePath, joinedCookie);
}

function formatTable(summaries: BenchmarkSummary[]): string {
	const header =
		"Page                Profile   Perf  A11y  BP    SEO   CLS     LCP(ms)  TBT(ms)  INP(ms)  Result";

	const rows = summaries.map((item) => {
		const inpText = item.inpMs === null ? "-" : String(item.inpMs);
		const status = item.passed ? "PASS" : "FAIL";

		return [
			item.page.padEnd(19),
			item.profile.padEnd(9),
			String(item.performance).padEnd(5),
			String(item.accessibility).padEnd(5),
			String(item.bestPractices).padEnd(5),
			String(item.seo).padEnd(5),
			String(item.cls).padEnd(7),
			String(item.lcpMs).padEnd(8),
			String(item.tbtMs).padEnd(8),
			inpText.padEnd(8),
			status,
		].join(" ");
	});

	return [header, "-".repeat(header.length), ...rows].join("\n");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function formatHtml(summaries: BenchmarkSummary[], elapsedSeconds: number): string {
	const rows = summaries
		.map((item) => {
			const cells = [
				item.page,
				item.profile,
				String(item.performance),
				String(item.accessibility),
				String(item.bestPractices),
				String(item.seo),
				String(item.cls),
				String(item.lcpMs),
				String(item.tbtMs),
				item.inpMs === null ? "-" : String(item.inpMs),
				item.passed ? "PASS" : "FAIL",
			];

			return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`;
		})
		.join("\n");

	return [
		"<!doctype html>",
		'<html lang="en">',
		"<head>",
		'<meta charset="utf-8">',
		"<title>convenr Web Vitals report</title>",
		"<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#222}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:0.5rem 0.75rem;text-align:left}th{background:#f5f5f5}</style>",
		"</head>",
		"<body>",
		`<h1>Web Vitals summary (${RUNS} runs median, ${elapsedSeconds}s total)</h1>`,
		"<table>",
		"<thead><tr><th>Page</th><th>Profile</th><th>Perf</th><th>A11y</th><th>BP</th><th>SEO</th><th>CLS</th><th>LCP (ms)</th><th>TBT (ms)</th><th>INP (ms)</th><th>Result</th></tr></thead>",
		"<tbody>",
		rows,
		"</tbody>",
		"</table>",
		"</body>",
		"</html>",
		"",
	].join("\n");
}

function selectedPages(pages: PageTarget[]): PageTarget[] {
	const filterRaw = (process.env["VITALS_PAGE"] ?? "").trim();

	if (filterRaw === "") {
		return pages;
	}

	const filters = filterRaw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part !== "");

	return pages.filter((page) =>
		filters.some((needle) => page.name === needle || page.name.includes(needle)),
	);
}

if (process.argv[2] === "--worker") {
	const parsed = workerPayloadSchema.parse(JSON.parse(process.argv[3] ?? ""));

	const target: PageTarget = {
		name: parsed.target.name,
		path: parsed.target.path,
		indexable: parsed.target.indexable,
	};

	if (parsed.target.cookieHeader !== undefined) {
		target.cookieHeader = parsed.target.cookieHeader;
	}

	if (parsed.target.inpFlow !== undefined) {
		target.inpFlow = parsed.target.inpFlow;
	}

	const summary = await auditOneJob(target, parsed.profile, parsed.chromePath, parsed.joinedCookie);

	console.log(JSON.stringify(summary));
	process.exit(0);
}

const startedAt = performance.now();

await recreateDatabase(DATABASE_URL);

const server = spawn("node", ["scripts/start-standalone.mts"], {
	cwd: join(REPOSITORY, "apps/web"),
	stdio: ["ignore", "inherit", "inherit"],
	env: {
		...process.env,
		PORT,
		HOSTNAME: "127.0.0.1",
		DATABASE_URL,
		TZ: ZONE,
		SMTP_URL: "smtp://127.0.0.1:1025",
		MAIL_FROM: "convenr <convenr@localhost>",
		AUTH_SECRET: "vitals-secret-that-is-long-enough-for-accounts",
		PUBLIC_URL: INSTANCE,
		GOOGLE_CLIENT_ID: "vitals",
		GOOGLE_CLIENT_SECRET: "vitals",
		GITHUB_CLIENT_ID: "vitals",
		GITHUB_CLIENT_SECRET: "vitals",
		OPERATOR_NAME: "Jana Nováková",
		PRIVACY_CONTACT: "privacy@example.org",
	},
});

let exitReason: string | undefined;

server.once("exit", (code, signal) => {
	exitReason = signal === null ? `code ${String(code)}` : `signal ${signal}`;
});

let passed = false;

try {
	await waitUntilHealthy(performance.now() + 60_000, () => exitReason);

	const seeded = await seedPages();
	const pages = selectedPages(seeded.pages);

	if (pages.length === 0) {
		throw new Error("VITALS_PAGE matched no benchmark pages.");
	}

	const jobs: BenchmarkJob[] = [];

	for (const target of pages) {
		jobs.push({ target, profile: "phone" }, { target, profile: "desktop" });
	}

	const chromePath = chromium.executablePath();
	const results = Array.from<BenchmarkSummary | undefined>({ length: jobs.length });
	let cursor = 0;

	const takeIndex = () => {
		const current = cursor;

		cursor += 1;

		return current;
	};

	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, () =>
			runWorker(jobs, results, takeIndex, chromePath, seeded.joinedCookie),
		),
	);

	const summaries = results.filter((entry): entry is BenchmarkSummary => entry !== undefined);
	const elapsedSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(1));

	mkdirSync(REPORT_DIR, { recursive: true });
	writeFileSync(
		join(REPORT_DIR, "latest.json"),
		JSON.stringify({ elapsedSeconds, runs: RUNS, summaries }, null, 2),
	);
	writeFileSync(join(REPORT_DIR, "latest.html"), formatHtml(summaries, elapsedSeconds));

	console.log(`\nWeb Vitals summary (${RUNS} runs median, ${elapsedSeconds}s total):\n`);
	console.log(formatTable(summaries));

	for (const item of summaries) {
		if (!item.passed) {
			console.log(`\n[FAIL] ${item.page} (${item.profile}): ${item.failures.join(", ")}`);

			for (const audit of item.failingAudits.slice(0, 8)) {
				const detail = audit.displayValue === "" ? "" : ` (${audit.displayValue})`;

				console.log(`  - ${audit.id}: ${audit.score}${detail} — ${audit.title}`);
			}
		}
	}

	passed = summaries.every((item) => item.passed);
} finally {
	server.kill();
}

process.exit(passed ? 0 : 1);
