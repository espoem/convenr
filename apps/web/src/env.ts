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
	/** The mail server, as `smtp://` or `smtps://` with its user and password. */
	SMTP_URL: z.url({ protocol: /^smtps?$/u }).optional(),
	/** The sender of every email, such as `convenr <hello@example.org>`. */
	MAIL_FROM: z.string().min(3).optional(),
	/** The secret that signs sessions and links and keys the email counts; 32 characters or more. */
	AUTH_SECRET: z.string().min(32).optional(),
	/** The address the instance is reached at, for links in emails and for passkeys. */
	PUBLIC_URL: z.url({ protocol: /^https?$/u }).optional(),
	/**
	 * The bearer token of `POST /api/maintenance`, for an instance whose maintenance pass a
	 * schedule starts from outside; 32 characters or more. Without it the route does not exist.
	 */
	MAINTENANCE_SECRET: z.string().min(32).optional(),
	/** Emails of all kinds the instance sends per hour at most. */
	MAIL_HOURLY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(300),
});

/** The settings that turn accounts on; an instance sets all of them or none. */
const ACCOUNT_SETTINGS = ["SMTP_URL", "MAIL_FROM", "AUTH_SECRET", "PUBLIC_URL"] as const;

export type Accounts =
	| { kind: "off" }
	| { kind: "on"; smtpUrl: string; mailFrom: string; secret: string; publicUrl: URL };

type Env = z.infer<typeof schema> & { accounts: Accounts };

/** Validates a set of environment variables. Throws when a required one is missing or malformed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const parsed = schema.parse(source);
	const missing = ACCOUNT_SETTINGS.filter((name) => parsed[name] === undefined);

	if (missing.length > 0 && missing.length < ACCOUNT_SETTINGS.length) {
		throw new Error(`Accounts need these settings as well: ${missing.join(", ")}.`);
	}

	const { SMTP_URL, MAIL_FROM, AUTH_SECRET, PUBLIC_URL } = parsed;

	const accounts: Accounts =
		SMTP_URL === undefined ||
		MAIL_FROM === undefined ||
		AUTH_SECRET === undefined ||
		PUBLIC_URL === undefined
			? { kind: "off" }
			: {
					kind: "on",
					smtpUrl: SMTP_URL,
					mailFrom: MAIL_FROM,
					secret: AUTH_SECRET,
					publicUrl: new URL(PUBLIC_URL),
				};

	return { ...parsed, accounts };
}

let cached: Env | undefined;

/** Reads and validates the server environment on first use, so a build needs no database. */
export function env(): Env {
	cached ??= parseEnv(process.env);

	return cached;
}
