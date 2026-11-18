// Next.js calls `register` once when a server starts and waits for it before serving requests.
export async function register() {
	if (process.env["NEXT_RUNTIME"] !== "nodejs") {
		return;
	}

	const { installSafeConsole } = await import("@/server/safe-log");

	// Before anything can fail, so that no logged query error carries its values.
	installSafeConsole();

	const { db } = await import("@/db/client");
	const { applyMigrations } = await import("@/db/migrate");

	await applyMigrations(db());

	const { env } = await import("@/env");
	const { runMaintenance } = await import("@/server/maintenance");

	// Usage counts by age and the purge of expired events run at
	// start and then every hour. Several servers on one database may run them side by side.
	async function purge() {
		try {
			await runMaintenance(db().$client, env().RETENTION_DAYS, Temporal.Now.instant().toString());
		} catch (error) {
			console.error("The maintenance pass failed; it runs again in an hour.", error);
		}
	}

	void purge();
	setInterval(() => void purge(), 60 * 60 * 1000).unref();
}
