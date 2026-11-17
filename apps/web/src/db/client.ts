import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";

type Database = ReturnType<typeof createDatabase>;

function createDatabase() {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });

  return drizzle(pool);
}

// One pool per process. Development reloads modules, so the pool is kept on globalThis there.
declare global {
  var convenrDatabase: Database | undefined;
}

export function db(): Database {
  globalThis.convenrDatabase ??= createDatabase();

  return globalThis.convenrDatabase;
}
