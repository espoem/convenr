import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env["E2E_PORT"] ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["html", { open: "never" }]] : "list",
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
    command: "node scripts/start-standalone.mjs",
    url: `${baseURL}/en`,
    reuseExistingServer: !process.env["CI"],
    env: {
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATABASE_URL:
        process.env["DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr",
    },
    timeout: 60_000,
  },
});
