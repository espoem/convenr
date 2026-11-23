// What a Node.js server does when it starts. Edge code must not load this file, so
// `instrumentation.ts` imports it behind a runtime check that the bundler can resolve.
export async function startNodeServer() {
	const { installSafeConsole } = await import("@/server/safe-log");

	// Before anything can fail, so that no logged query error carries its values.
	installSafeConsole();

	// Vercel runs this on every cold start of a short-lived instance, where a timer does not
	// survive. The deployment migrates before it ships, and a schedule runs the maintenance pass (ADR 0005).
	if (process.env["VERCEL"] === "1") {
		return;
	}

	const { db } = await import("@/db/client");
	const { applyMigrations } = await import("@/db/migrate");

	await applyMigrations(db());

	const { maintain } = await import("@/server/maintain");

	// The maintenance pass runs at start and then every hour. Several servers on one database may
	// run it side by side.
	async function purge() {
		try {
			await maintain();
		} catch (error) {
			console.error("The maintenance pass failed; it runs again in an hour.", error);
		}
	}

	void purge();
	setInterval(() => void purge(), 60 * 60 * 1000).unref();
}
