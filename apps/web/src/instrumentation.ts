// Next.js calls `register` once when a server starts and waits for it before serving requests.
export async function register() {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") {
    return;
  }

  const { db } = await import("@/db/client");
  const { applyMigrations } = await import("@/db/migrate");

  await applyMigrations(db());
}
