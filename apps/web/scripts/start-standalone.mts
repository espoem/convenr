// Starts the standalone production server the same way the container image does:
// the static assets are copied next to the server before it starts.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const appDir = join(import.meta.dirname, "..");
const standaloneApp = join(appDir, ".next/standalone/apps/web");

if (!existsSync(join(standaloneApp, "server.js"))) {
	console.error("No production build found. Run `mise run build` first.");
	process.exit(1);
}

const buildId = readFileSync(join(appDir, ".next/BUILD_ID"), "utf8").trim();
const marker = join(standaloneApp, ".next/static-build-id");
const lockDir = join(standaloneApp, ".next/static-copy.lock");

async function syncStatic(tries = 100): Promise<void> {
	if (existsSync(marker) && readFileSync(marker, "utf8").trim() === buildId) {
		return;
	}

	try {
		mkdirSync(lockDir);
	} catch {
		if (tries === 0) {
			throw new Error("Timed out waiting to copy standalone static assets.");
		}

		await delay(50);

		return syncStatic(tries - 1);
	}

	try {
		if (!existsSync(marker) || readFileSync(marker, "utf8").trim() !== buildId) {
			cpSync(join(appDir, ".next/static"), join(standaloneApp, ".next/static"), {
				recursive: true,
			});
			writeFileSync(marker, buildId);
		}
	} finally {
		rmSync(lockDir, { recursive: true, force: true });
	}
}

await syncStatic();

await import(join(standaloneApp, "server.js"));
