// Recreates the E2E database before Playwright starts its standalone servers.
import { Client } from "pg";

const databaseUrl =
	process.env["DATABASE_URL"] ?? "postgres://convenr:convenr@127.0.0.1:5432/convenr_e2e";

const target = new URL(databaseUrl);
const name = target.pathname.slice(1);

if (!/^\w+_e2e$/u.test(name)) {
	throw new Error(`Refusing to recreate "${name}": the e2e database name ends in _e2e.`);
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
