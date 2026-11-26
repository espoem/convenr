import { z } from "zod";

import { type Provider, PROVIDERS } from "@/domain/provider-address";

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
	/** The application registered at each sign-in provider. */
	GOOGLE_CLIENT_ID: z.string().min(1).optional(),
	GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	GITHUB_CLIENT_ID: z.string().min(1).optional(),
	GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
	/**
	 * The bearer token of `POST /api/maintenance`, for an instance whose maintenance pass a
	 * schedule starts from outside; 32 characters or more. Without it the route does not exist.
	 */
	MAINTENANCE_SECRET: z.string().min(32).optional(),
	/** The least minutes between two new-responses emails for one account and event. */
	NOTIFY_DIGEST_MINUTES: z.coerce.number().int().min(1).max(10_080).default(60),
	/** Hours before the final time that its reminder is due. */
	REMINDER_HOURS: z.coerce.number().int().min(1).max(720).default(24),
	/** Emails of all kinds the instance sends per hour at most. */
	MAIL_HOURLY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(300),
	/** Who runs the instance, named as its data controller on the privacy page. */
	OPERATOR_NAME: z.string().trim().min(1).optional(),
	/** The email address for questions about personal data. */
	PRIVACY_CONTACT: z.email().optional(),
});

/** The privacy page, which an instance shows only once it names its operator. */
export type Privacy = { kind: "off" } | { kind: "on"; operator: string; contact: string };

/** The privacy page needs both settings; one alone stops the server, naming the other. */
function privacyOf({ OPERATOR_NAME, PRIVACY_CONTACT }: z.infer<typeof schema>): Privacy {
	if (OPERATOR_NAME === undefined && PRIVACY_CONTACT === undefined) {
		return { kind: "off" };
	}

	if (OPERATOR_NAME === undefined || PRIVACY_CONTACT === undefined) {
		throw new Error(
			`The privacy page needs this setting as well: ${OPERATOR_NAME === undefined ? "OPERATOR_NAME" : "PRIVACY_CONTACT"}.`,
		);
	}

	return { kind: "on", operator: OPERATOR_NAME, contact: PRIVACY_CONTACT };
}

/** The settings that turn accounts on; an instance sets all of them or none. */
const ACCOUNT_SETTINGS = ["SMTP_URL", "MAIL_FROM", "AUTH_SECRET", "PUBLIC_URL"] as const;

/** The settings that turn a provider on; an instance sets both of a pair or neither. */
const PROVIDER_SETTINGS = {
	google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
	github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
} as const satisfies Record<Provider, readonly [string, string]>;

export type ProviderSettings = { provider: Provider; clientId: string; clientSecret: string };

export type Accounts =
	| { kind: "off" }
	| {
			kind: "on";
			smtpUrl: string;
			mailFrom: string;
			secret: string;
			publicUrl: URL;
			providers: ProviderSettings[];
	  };

type Env = z.infer<typeof schema> & { accounts: Accounts; privacy: Privacy };

/** The providers whose pair of settings is complete; throws when one of a pair is missing. */
function providersOf(parsed: z.infer<typeof schema>): ProviderSettings[] {
	return PROVIDERS.flatMap((provider) => {
		const [idName, secretName] = PROVIDER_SETTINGS[provider];
		const clientId = parsed[idName];
		const clientSecret = parsed[secretName];

		if (clientId === undefined && clientSecret === undefined) {
			return [];
		}

		if (clientId === undefined || clientSecret === undefined) {
			throw new Error(
				`A sign-in provider needs this setting as well: ${clientId === undefined ? idName : secretName}.`,
			);
		}

		return [{ provider, clientId, clientSecret }];
	});
}

/** Validates a set of environment variables. Throws when a required one is missing or malformed. */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const parsed = schema.parse(source);
	const missing = ACCOUNT_SETTINGS.filter((name) => parsed[name] === undefined);

	if (missing.length > 0 && missing.length < ACCOUNT_SETTINGS.length) {
		throw new Error(`Accounts need these settings as well: ${missing.join(", ")}.`);
	}

	const { SMTP_URL, MAIL_FROM, AUTH_SECRET, PUBLIC_URL } = parsed;
	const providers = providersOf(parsed);

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
					providers,
				};

	return { ...parsed, accounts, privacy: privacyOf(parsed) };
}

let cached: Env | undefined;

/** Reads and validates the server environment on first use, so a build needs no database. */
export function env(): Env {
	cached ??= parseEnv(process.env);

	return cached;
}
