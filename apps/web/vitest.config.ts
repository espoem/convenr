import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// The setup drops and recreates this database, so its name must end in `_test`.
const testDatabaseUrl =
	process.env["TEST_DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr_test";

export default defineConfig({
	resolve: {
		alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
	},
	test: {
		environment: "node",
		projects: [
			{
				extends: true,
				test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/**/*.db.test.ts"] },
			},
			{
				// Needs PostgreSQL: `mise run db:up`. The setup recreates a separate test database.
				extends: true,
				test: {
					name: "db",
					include: ["src/**/*.db.test.ts"],
					globalSetup: ["src/db/test-setup.ts"],
					// Accounts are on, so their tables and limits can be tested; nothing sends email.
					env: {
						DATABASE_URL: testDatabaseUrl,
						SMTP_URL: "smtp://127.0.0.1:9",
						MAIL_FROM: "convenr <convenr@localhost>",
						AUTH_SECRET: "test-secret-that-is-long-enough-for-accounts",
						PUBLIC_URL: "http://localhost:3000",
						MAIL_HOURLY_LIMIT: "5",
					},
					fileParallelism: false,
				},
			},
		],
	},
});
