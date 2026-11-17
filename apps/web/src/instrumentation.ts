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
	const { purgeExpired } = await import("@/server/purge");

	// Phase 2 rule X4: expired events are deleted at start and then every hour. Each run is
	// idempotent, so several servers on one database may run it side by side.
	async function purge() {
		try {
			await purgeExpired(db().$client, env().RETENTION_DAYS, Temporal.Now.instant().toString());
		} catch (error) {
			console.error("The purge of expired events failed; it runs again in an hour.", error);
		}
	}

	void purge();
	setInterval(() => void purge(), 60 * 60 * 1000).unref();
}
