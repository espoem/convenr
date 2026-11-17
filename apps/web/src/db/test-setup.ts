import { sql } from "drizzle-orm";
import type { TestProject } from "vitest/node";

import { connect } from "./client";
import { applyMigrations } from "./migrate";

/**
 * Vitest global setup of the `db` project: recreates the database named by the project's
 * `DATABASE_URL` and applies every migration.
 */
export default async function setup(project: TestProject): Promise<void> {
  const testDatabaseUrl = project.config.env["DATABASE_URL"];

  if (testDatabaseUrl === undefined) {
    throw new Error("The db test project sets no DATABASE_URL.");
  }

  const url = new URL(testDatabaseUrl);
  const name = url.pathname.slice(1);

  if (!/^\w+_test$/.test(name)) {
    throw new Error(`Refusing to recreate "${name}": a test database name ends in _test.`);
  }

  url.pathname = "/postgres";

  const server = connect(url.toString());

  await server.execute(sql.raw(`drop database if exists "${name}" with (force)`));
  await server.execute(sql.raw(`create database "${name}"`));
  await server.$client.end();

  const database = connect(testDatabaseUrl);

  await applyMigrations(database);
  await database.$client.end();
}
