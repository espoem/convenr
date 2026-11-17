import { defineConfig, devices } from "@playwright/test";

import { DATABASE_URL } from "./e2e/database";

const port = Number(process.env["E2E_PORT"] ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

const ci = (process.env["CI"] ?? "") !== "";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: true,
	forbidOnly: ci,
	retries: ci ? 1 : 0,
	reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
	use: { baseURL, trace: "retain-on-failure" },
	projects: [
		// The phone-sized viewport the Phase 1 acceptance test is defined for.
		{
			name: "phone",
			use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true },
		},
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
	],
	webServer: {
		// Serves the production build. Run `mise run build` first.
		command: "node scripts/start-standalone.mts",
		url: `${baseURL}/en`,
		reuseExistingServer: !ci,
		env: {
			PORT: String(port),
			HOSTNAME: "127.0.0.1",
			DATABASE_URL,
		},
		timeout: 60_000,
	},
});
