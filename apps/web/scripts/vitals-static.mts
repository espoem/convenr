// Enforces per-route gzipped initial JS and CSS bundle budgets from the Next.js build output.
// Usage: node apps/web/scripts/vitals-static.mts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { z } from "zod";

type RouteBudget = {
	name: string;
	manifestPath: string;
	maxJsGz: number;
	maxCssGz: number;
};

const NEXT_DIR = join(import.meta.dirname, "../.next");
const BUILD_MANIFEST_PATH = join(NEXT_DIR, "build-manifest.json");

const buildManifestSchema = z.object({ rootMainFiles: z.array(z.string()) });

// Budgets sit ~10% above the optimized baseline so regressions fail deterministically in CI.
const ROUTE_BUDGETS: readonly RouteBudget[] = [
	{
		name: "start",
		manifestPath: "server/app/[locale]/page_client-reference-manifest.js",
		maxJsGz: 235_000,
		maxCssGz: 12_000,
	},
	{
		name: "event",
		manifestPath: "server/app/[locale]/e/[segment]/page_client-reference-manifest.js",
		maxJsGz: 246_000,
		maxCssGz: 12_000,
	},
	{
		name: "api",
		manifestPath: "server/app/[locale]/api/page_client-reference-manifest.js",
		maxJsGz: 180_000,
		maxCssGz: 12_000,
	},
	{
		name: "privacy",
		manifestPath: "server/app/[locale]/privacy/page_client-reference-manifest.js",
		maxJsGz: 180_000,
		maxCssGz: 12_000,
	},
	{
		name: "sign-in",
		manifestPath: "server/app/[locale]/sign-in/page_client-reference-manifest.js",
		maxJsGz: 242_000,
		maxCssGz: 12_000,
	},
];

function gzipBytes(relativeChunkPath: string): number {
	const fullPath = join(NEXT_DIR, relativeChunkPath);

	if (!existsSync(fullPath)) {
		throw new Error(`Missing build chunk: ${fullPath}`);
	}

	return gzipSync(readFileSync(fullPath)).length;
}

if (!existsSync(BUILD_MANIFEST_PATH)) {
	console.error("Missing apps/web/.next/build-manifest.json; run `mise run build` first.");
	process.exit(1);
}

const buildManifest = buildManifestSchema.parse(
	JSON.parse(readFileSync(BUILD_MANIFEST_PATH, "utf8")),
);

const rootFiles = new Set(buildManifest.rootMainFiles);

let rootJsGz = 0;

for (const file of rootFiles) {
	if (file.endsWith(".js")) {
		rootJsGz += gzipBytes(file);
	}
}

console.log(
	[
		"",
		"Static bundle budgets (gzipped bytes):",
		"",
		"Route      JS(gz)    Budget    CSS(gz)   Budget    Result",
		"---------------------------------------------------------",
	].join("\n"),
);

let allPassed = true;

for (const route of ROUTE_BUDGETS) {
	const manifestFullPath = join(NEXT_DIR, route.manifestPath);

	if (!existsSync(manifestFullPath)) {
		console.error(`Missing route manifest: ${manifestFullPath}`);
		allPassed = false;
		continue;
	}

	const manifestText = readFileSync(manifestFullPath, "utf8");
	const chunkRefs = new Set<string>();

	for (const match of manifestText.matchAll(/static\/chunks\/[a-zA-Z0-9._-]+\.(?:js|css)/gu)) {
		chunkRefs.add(match[0]);
	}

	let pageJsGz = 0;
	let cssGz = 0;

	for (const chunkRef of chunkRefs) {
		if (chunkRef.endsWith(".js") && !rootFiles.has(chunkRef)) {
			pageJsGz += gzipBytes(chunkRef);
		} else if (chunkRef.endsWith(".css")) {
			cssGz += gzipBytes(chunkRef);
		}
	}

	const totalJsGz = rootJsGz + pageJsGz;
	const ok = totalJsGz <= route.maxJsGz && cssGz <= route.maxCssGz;

	if (!ok) {
		allPassed = false;
	}

	console.log(
		[
			route.name.padEnd(10),
			String(totalJsGz).padEnd(9),
			String(route.maxJsGz).padEnd(9),
			String(cssGz).padEnd(9),
			String(route.maxCssGz).padEnd(9),
			ok ? "PASS" : "FAIL",
		].join(" "),
	);
}

process.exit(allPassed ? 0 : 1);
