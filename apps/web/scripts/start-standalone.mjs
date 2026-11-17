// Starts the standalone production server the same way the container image does:
// the static assets are copied next to the server before it starts.
import { cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneApp = join(appDir, ".next/standalone/apps/web");

if (!existsSync(join(standaloneApp, "server.js"))) {
  console.error("No production build found. Run `mise run build` first.");
  process.exit(1);
}

cpSync(join(appDir, ".next/static"), join(standaloneApp, ".next/static"), { recursive: true });

await import(join(standaloneApp, "server.js"));
