import { defineConfig, devices } from "@playwright/test";

import { DATABASE_URL } from "./e2e/database";
import { BASE_URL, PORT, POLL_BASE_URL, POLL_PORT, POLL_SECONDS } from "./e2e/servers";

const ci = (process.env["CI"] ?? "") !== "";

// Two browsers at a time, also on a CI runner: more made a shared machine slow enough for
// assertions to time out. `E2E_WORKERS` raises it on a machine that has room.
const workers = Number(process.env["E2E_WORKERS"] ?? 2);

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	workers,
	forbidOnly: ci,
	retries: ci ? 1 : 0,
	reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
	// Recording a trace costs every test screenshots and snapshots, so only a retry records
	// one. Pass `--trace on` to record them locally.
	use: { baseURL: BASE_URL, trace: "on-first-retry" },
	projects: [
		// Phones are the main target, so every end-to-end test runs at phone size.
		{
			name: "phone",
			use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
		},
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
	],
	// Both serve the production build. Run `mise run build` first.
	webServer: [
		{
			command: "node scripts/start-standalone.mts",
			url: `${BASE_URL}/en`,
			reuseExistingServer: !ci,
			env: { PORT: String(PORT), HOSTNAME: "127.0.0.1", DATABASE_URL },
			timeout: 60_000,
		},
		{
			command: "node scripts/start-standalone.mts",
			url: `${POLL_BASE_URL}/en`,
			reuseExistingServer: !ci,
			env: {
				PORT: String(POLL_PORT),
				HOSTNAME: "127.0.0.1",
				DATABASE_URL,
				LIVE_UPDATES: "poll",
				LIVE_POLL_SECONDS: String(POLL_SECONDS),
			},
			timeout: 60_000,
		},
	],
});
