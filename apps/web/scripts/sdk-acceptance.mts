// Runs the acceptance suites of both SDKs and the commands of the README's API guide against
// the production build on an empty database: recreates the database, starts the standalone
// server, which applies the migrations, and runs Vitest in packages/sdk-ts, pytest in
// packages/sdk-python and the guide's shell blocks with CONVENR_URL set. Needs
// `mise run build` and PostgreSQL. SDK_DATABASE_URL and SDK_PORT choose another database or port.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Client } from "pg";

const repository = join(import.meta.dirname, "../../..");

const databaseUrl =
	process.env["SDK_DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr_sdk";

const port = process.env["SDK_PORT"] ?? "3500";
const instance = `http://127.0.0.1:${port}`;

async function recreate(url: string): Promise<void> {
	const target = new URL(url);
	const name = target.pathname.slice(1);

	if (!/^\w+_sdk$/u.test(name)) {
		throw new Error(`Refusing to recreate "${name}": the SDK database name ends in _sdk.`);
	}

	target.pathname = "/postgres";

	const server = new Client({ connectionString: target.toString() });

	await server.connect();

	try {
		await server.query(`drop database if exists "${name}" with (force)`);
		await server.query(`create database "${name}"`);
	} finally {
		await server.end();
	}
}

async function healthy(): Promise<boolean> {
	try {
		const response = await fetch(`${instance}/api/health`, { signal: AbortSignal.timeout(2000) });

		return response.ok;
	} catch {
		// The server is not listening yet, or did not answer in time.
		return false;
	}
}

async function waitUntilHealthy(deadline: number, exited: () => string | undefined): Promise<void> {
	const exitReason = exited();

	if (exitReason !== undefined) {
		throw new Error(`The server at ${instance} exited before becoming healthy (${exitReason}).`);
	}

	if (await healthy()) {
		return;
	}

	if (performance.now() > deadline) {
		throw new Error(`The server at ${instance} did not become healthy in time.`);
	}

	await sleep(250);

	return waitUntilHealthy(deadline, exited);
}

function run(command: string, args: string[], cwd: string): boolean {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		env: { ...process.env, CONVENR_URL: instance },
	});

	return result.status === 0;
}

const GUIDE_HEADING = "## Local API test";

/** The shell blocks of the README's API guide, joined in order into one script. */
function apiGuide(): string {
	const readme = readFileSync(join(repository, "README.md"), "utf8");
	const start = readme.indexOf(`\n${GUIDE_HEADING}\n`);

	if (start === -1) {
		throw new Error(`README.md has no section "${GUIDE_HEADING}".`);
	}

	const next = readme.indexOf("\n## ", start + 1);
	const section = readme.slice(start, next === -1 ? undefined : next);
	const blocks = [...section.matchAll(/^```sh\n(.*?)^```$/gmsu)].map((match) => match[1] ?? "");

	if (blocks.length === 0) {
		throw new Error(`The section "${GUIDE_HEADING}" has no shell block.`);
	}

	return blocks.join("\n");
}

await recreate(databaseUrl);

const server = spawn("node", ["scripts/start-standalone.mts"], {
	cwd: join(repository, "apps/web"),
	stdio: ["ignore", "inherit", "inherit"],
	env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1", DATABASE_URL: databaseUrl },
});

let exitReason: string | undefined;

server.once("exit", (code, signal) => {
	exitReason = signal === null ? `code ${String(code)}` : `signal ${signal}`;
});

let passed = false;

try {
	await waitUntilHealthy(performance.now() + 60_000, () => exitReason);

	const typescript = run("nub", ["run", "test:acceptance"], join(repository, "packages/sdk-ts"));

	const python = run(
		"uv",
		["run", "--locked", "pytest", "acceptance"],
		join(repository, "packages/sdk-python"),
	);

	// One shell, as a reader runs the guide; any failing command, also inside a pipe, fails it.
	const guide = run("bash", ["-euo", "pipefail", "-c", apiGuide()], repository);

	passed = typescript && python && guide;
} finally {
	server.kill();
}

process.exit(passed ? 0 : 1);
