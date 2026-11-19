// Runs the acceptance suites of both SDKs against the production build on an empty database:
// recreates the database, starts the standalone server, which applies the migrations, and
// runs Vitest in packages/sdk-ts and pytest in packages/sdk-python with CONVENR_URL set.
// Needs `mise run build` and PostgreSQL. SDK_DATABASE_URL and SDK_PORT choose another
// database or port.
import { spawn, spawnSync } from "node:child_process";
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

async function waitUntilHealthy(deadline: number): Promise<void> {
	if (await healthy()) {
		return;
	}

	if (performance.now() > deadline) {
		throw new Error(`The server at ${instance} did not become healthy in time.`);
	}

	await sleep(250);

	return waitUntilHealthy(deadline);
}

function run(command: string, args: string[], cwd: string): boolean {
	const result = spawnSync(command, args, {
		cwd,
		stdio: "inherit",
		env: { ...process.env, CONVENR_URL: instance },
	});

	return result.status === 0;
}

await recreate(databaseUrl);

const server = spawn("node", ["scripts/start-standalone.mts"], {
	cwd: join(repository, "apps/web"),
	stdio: ["ignore", "inherit", "inherit"],
	env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1", DATABASE_URL: databaseUrl },
});

let passed = false;

try {
	await waitUntilHealthy(performance.now() + 60_000);

	const typescript = run("nub", ["run", "test:acceptance"], join(repository, "packages/sdk-ts"));

	const python = run(
		"uv",
		["run", "--locked", "pytest", "acceptance"],
		join(repository, "packages/sdk-python"),
	);

	passed = typescript && python;
} finally {
	server.kill();
}

process.exit(passed ? 0 : 1);
