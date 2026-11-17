// Starts the standalone production server the same way the container image does:
// the static assets are copied next to the server before it starts.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const appDir = join(import.meta.dirname, "..");
const standaloneApp = join(appDir, ".next/standalone/apps/web");

if (!existsSync(join(standaloneApp, "server.js"))) {
	console.error("No production build found. Run `mise run build` first.");
	process.exit(1);
}

cpSync(join(appDir, ".next/static"), join(standaloneApp, ".next/static"), { recursive: true });

await import(join(standaloneApp, "server.js"));
