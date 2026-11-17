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
}
