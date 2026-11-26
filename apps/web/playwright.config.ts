import { defineConfig, devices } from "@playwright/test";

import { DATABASE_URL } from "./e2e/database";
import {
	ACCOUNTS_BASE_URL,
	BASE_URL,
	MAILPIT_URL,
	PORT,
	POLL_BASE_URL,
	POLL_PORT,
	POLL_SECONDS,
	SMTP_PORT,
} from "./e2e/servers";

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
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1280, height: 800 },
				hasTouch: false,
			},
		},
	],
	// Both serve the production build. Run `mise run build` first.
	webServer: [
		{
			command: `mailpit --smtp 127.0.0.1:${SMTP_PORT} --listen ${new URL(MAILPIT_URL).host} --max 1000`,
			url: `${MAILPIT_URL}/api/v1/info`,
			reuseExistingServer: !ci,
			timeout: 30_000,
		},
		{
			command: "node scripts/start-standalone.mts",
			url: `${BASE_URL}/en`,
			reuseExistingServer: !ci,
			env: {
				PORT: String(PORT),
				HOSTNAME: "127.0.0.1",
				DATABASE_URL,
				SMTP_URL: `smtp://127.0.0.1:${SMTP_PORT}`,
				MAIL_FROM: "convenr <convenr@localhost>",
				AUTH_SECRET: "e2e-secret-that-is-long-enough-for-accounts",
				PUBLIC_URL: ACCOUNTS_BASE_URL,
				// Every test signs in under its own address; a higher limit keeps parallel runs apart.
				MAIL_HOURLY_LIMIT: "10000",
				GOOGLE_CLIENT_ID: "e2e",
				GOOGLE_CLIENT_SECRET: "e2e",
				GITHUB_CLIENT_ID: "e2e",
				GITHUB_CLIENT_SECRET: "e2e",
				// The test answers the server's requests to the providers.
				NODE_OPTIONS: `--import ${new URL("e2e/provider-answers.mts", import.meta.url).href}`,
				OPERATOR_NAME: "Jana Nováková",
				PRIVACY_CONTACT: "privacy@example.org",
			},
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
