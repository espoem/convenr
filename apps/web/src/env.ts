import { z } from "zod";

const databaseUrl = z.url({ protocol: /^postgres(ql)?$/u });

const schema = z.object({
	DATABASE_URL: databaseUrl,
	/** A direct address for `LISTEN` when `DATABASE_URL` goes through a transaction pooler. */
	DATABASE_LISTEN_URL: databaseUrl.optional(),
	/** Days between an event's last date or last change and its deletion, or `never`. */
	RETENTION_DAYS: z.union([z.literal("never"), z.coerce.number().int().min(1)]).default(90),
	/** How open pages learn of a change (ADR 0006): a stream from the server, or checks. */
	LIVE_UPDATES: z.enum(["push", "poll"]).default("push"),
	/** Seconds between the checks of `poll`, and of `push` after it fell back. */
	LIVE_POLL_SECONDS: z.coerce.number().int().min(1).max(3600).default(15),
	/** Seconds after which the server closes a stream; the page opens a new one. */
	LIVE_STREAM_SECONDS: z.coerce.number().int().min(10).max(3600).default(300),
	/** Minutes without input after which a visible page stops its updates. */
	LIVE_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
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
