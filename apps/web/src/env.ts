import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

type Env = z.infer<typeof schema>;

/** Validates a set of environment variables. Throws when a required one is missing or malformed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

let cached: Env | undefined;

/** Reads and validates the server environment on first use, so a build needs no database. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
