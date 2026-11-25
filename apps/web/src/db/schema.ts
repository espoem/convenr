// Tables of events, participants, responses, tokens and usage counts, as in ADR 0002 and ADR 0003.
import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	date,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { LEVELS } from "@/domain/levels";
import { MAX_ATTEMPTS, NOTIFICATION_KINDS, type OutboxMessage } from "@/domain/notifications";
import type { EventVersion } from "@/lib/event-version";

// Column names come from the property names in snake_case; see `casing` in the client.
const instant = () => timestamp({ withTimezone: true, mode: "string" });

export const events = pgTable(
	"events",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		description: text().notNull().default(""),
		/**
		 * A grid of slots or a poll of options. A poll has none of the grid's columns, and a grid
		 * has all of them. The default lets a release that knows no polls keep writing grids.
		 */
		kind: text({ enum: ["grid", "poll"] })
			.notNull()
			.default("grid"),
		dayMode: text({ enum: ["range", "dates", "weekdays"] }),
		rangeFirst: date({ mode: "string" }),
		rangeLast: date({ mode: "string" }),
		dates: date({ mode: "string" }).array(),
		weekdays: smallint().array(),
		/** Minutes after midnight in the reference zone. */
		dailyStart: smallint(),
		dailyEnd: smallint(),
		slotLength: smallint(),
		referenceZone: text().notNull(),
		/** ISO day of week the columns start on. */
		firstDayOfWeek: smallint(),
		/** SHA-256 of the admin secret, base64url. */
		adminSecretHash: text().notNull(),
		createdAt: instant().notNull().defaultNow(),
		/** The count of the event's changes: the entity tag, and what a confirmation names. */
		version: bigint({ mode: "bigint" })
			.$type<EventVersion>()
			.notNull()
			.default(sql`1`),
		/** When the event last changed, and the base of a weekday event's deletion date. */
		changedAt: instant().notNull().defaultNow(),
		/** When the event entered the activation counts, so that it counts once. */
		activationCountedAt: instant(),
		sizeCountedAt: instant(),
		firstResponseCountedAt: instant(),
		/** Whether the organizer picked a final time; `chosen` is exactly when both ends are set. */
		finalState: text({ enum: ["open", "chosen"] })
			.notNull()
			.default("open"),
		finalStart: instant(),
		finalEnd: instant(),
		/** How many times a final time was picked or changed; clearing it keeps the count. */
		finalSequence: integer().notNull().default(0),
		/** When the event entered the time-to-final counts, so that it counts once. */
		finalCountedAt: instant(),
		/**
		 * The final sequence whose reminder is settled: sent, or not due because the final time
		 * was picked too close to its start. A reminder is due only while it differs.
		 */
		remindedSequence: integer().notNull().default(0),
		/**
		 * The account that added the event with its admin secret. An event belongs to one account
		 * or none, and deleting the account leaves the event without an owner.
		 */
		ownerId: text().references(() => authUsers.id, { onDelete: "set null" }),
		/**
		 * The owner's keeping in one field: `null` when never kept, `infinity` while kept, and the
		 * instant the keeping ended otherwise. Only an owned event is kept; the trigger
		 * events_keeping_ends_with_owner ends the keeping when the event loses its owner.
		 */
		keptUntil: instant(),
	},
	(table) => [
		index("events_owner").on(table.ownerId),
		check(
			"events_schedule_matches_kind",
			sql`case ${table.kind}
        when 'poll' then ${table.dayMode} is null and ${table.rangeFirst} is null
          and ${table.rangeLast} is null and ${table.dates} is null and ${table.weekdays} is null
          and ${table.dailyStart} is null and ${table.dailyEnd} is null
          and ${table.slotLength} is null and ${table.firstDayOfWeek} is null
        when 'grid' then ${table.dailyStart} is not null and ${table.dailyEnd} is not null
          and ${table.slotLength} is not null and ${table.firstDayOfWeek} is not null
          and case ${table.dayMode}
            when 'range' then ${table.rangeFirst} is not null and ${table.rangeLast} is not null
              and ${table.dates} is null and ${table.weekdays} is null
            when 'dates' then ${table.dates} is not null
              and ${table.rangeFirst} is null and ${table.rangeLast} is null and ${table.weekdays} is null
            when 'weekdays' then ${table.weekdays} is not null
              and ${table.rangeFirst} is null and ${table.rangeLast} is null and ${table.dates} is null
            else false
          end
        else false
      end`,
		),
		check(
			"events_daily_range",
			sql`${table.dailyStart} >= 0 and ${table.dailyEnd} <= 1440 and ${table.dailyStart} < ${table.dailyEnd}`,
		),
		check("events_slot_length", sql`${table.slotLength} in (15, 30, 60)`),
		check("events_first_day_of_week", sql`${table.firstDayOfWeek} between 1 and 7`),
		check(
			"events_final",
			sql`case ${table.finalState}
        when 'open' then ${table.finalStart} is null and ${table.finalEnd} is null
        when 'chosen' then ${table.finalStart} is not null and ${table.finalEnd} is not null
          and ${table.finalStart} < ${table.finalEnd}
        else false
      end`,
		),
		check("events_final_sequence", sql`${table.finalSequence} >= 0`),
		check(
			"events_kept_by_owner",
			sql`${table.keptUntil} is distinct from 'infinity' or ${table.ownerId} is not null`,
		),
	],
);

export const participants = pgTable(
	"participants",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		/** The id a client sees, from the alphabet of event ids. The uuid stays inside the server. */
		publicId: text().notNull(),
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		displayName: text().notNull(),
		/** The display name lower-cased, so that names differing in case are the same name. */
		nameKey: text().notNull(),
		/** Argon2id hash in PHC string format. */
		passwordHash: text(),
		failedAttempts: smallint().notNull().default(0),
		attemptCycle: integer().notNull().default(0),
		attemptRefunds: smallint().notNull().default(0),
		/** When the last attempt was counted. The count is forgotten 15 minutes after it. */
		lastAttemptAt: instant(),
		lockedUntil: instant(),
		createdAt: instant().notNull().defaultNow(),
		/**
		 * The account the participant is linked to, which recognizes it wherever it is signed in
		 * without a token. Deleting the account leaves an ordinary participant.
		 */
		accountId: text().references(() => authUsers.id, { onDelete: "set null" }),
	},
	(table) => [
		unique("participants_event_name").on(table.eventId, table.nameKey),
		// An account is one participant of an event at most.
		unique("participants_event_account").on(table.eventId, table.accountId),
		index("participants_account").on(table.accountId),
		unique("participants_public_id").on(table.publicId),
		// The target of a poll answer's key, which ties the participant to the option's event.
		unique("participants_id_event").on(table.id, table.eventId),
		check("participants_failed_attempts", sql`${table.failedAttempts} >= 0`),
	],
);

/** An option of a poll: a start and an end on one date in the reference zone. */
export const pollOptions = pgTable(
	"poll_options",
	{
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		/** From the alphabet of event ids; unique within the event. */
		id: text().notNull(),
		start: instant().notNull(),
		end: instant().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.eventId, table.id] }),
		unique("poll_options_times").on(table.eventId, table.start, table.end),
		check("poll_options_end_after_start", sql`${table.start} < ${table.end}`),
	],
);

export const participantTokens = pgTable("participant_tokens", {
	/** SHA-256 of the token, base64url. */
	tokenHash: text().primaryKey(),
	participantId: uuid()
		.notNull()
		.references(() => participants.id, { onDelete: "cascade" }),
	createdAt: instant().notNull().defaultNow(),
});

/**
 * A slot's level. The default lets a release that knows no levels keep writing rows, which
 * read as available.
 */
const level = () => text({ enum: LEVELS }).notNull().default("available");

export const datedAvailability = pgTable(
	"dated_availability",
	{
		participantId: uuid()
			.notNull()
			.references(() => participants.id, { onDelete: "cascade" }),
		slotStart: instant().notNull(),
		level: level(),
	},
	(table) => [
		primaryKey({ columns: [table.participantId, table.slotStart] }),
		check("dated_availability_level", sql`${table.level} in ('available', 'if_need_be')`),
	],
);

export const weekdayAvailability = pgTable(
	"weekday_availability",
	{
		participantId: uuid()
			.notNull()
			.references(() => participants.id, { onDelete: "cascade" }),
		weekday: smallint().notNull(),
		minute: smallint().notNull(),
		level: level(),
	},
	(table) => [
		primaryKey({ columns: [table.participantId, table.weekday, table.minute] }),
		check("weekday_availability_level", sql`${table.level} in ('available', 'if_need_be')`),
		check("weekday_availability_weekday", sql`${table.weekday} between 1 and 7`),
		check("weekday_availability_minute", sql`${table.minute} between 0 and 1439`),
	],
);

/**
 * A participant's level of a poll option. Both keys name the event, so an answer cannot join a
 * participant to another event's option, and removing an option or a participant removes it.
 */
export const pollAvailability = pgTable(
	"poll_availability",
	{
		participantId: uuid().notNull(),
		eventId: text().notNull(),
		optionId: text().notNull(),
		level: text({ enum: LEVELS }).notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.participantId, table.optionId] }),
		foreignKey({
			name: "poll_availability_participant",
			columns: [table.participantId, table.eventId],
			foreignColumns: [participants.id, participants.eventId],
		}).onDelete("cascade"),
		foreignKey({
			name: "poll_availability_option",
			columns: [table.eventId, table.optionId],
			foreignColumns: [pollOptions.eventId, pollOptions.id],
		}).onDelete("cascade"),
		check("poll_availability_level", sql`${table.level} in ('available', 'if_need_be')`),
	],
);

/**
 * Daily usage counts. No column names an event. `bucket` is 0 for a
 * plain count, the participant count for `group_size`, and the bucket index of the time since
 * creation for `first_response` and `time_to_final`.
 */
export const usageCounts = pgTable(
	"usage_counts",
	{
		/** A calendar day in UTC. */
		day: date({ mode: "string" }).notNull(),
		metric: text({
			enum: [
				"events_created",
				"activation_evaluated",
				"activated",
				"group_size",
				"first_response",
				"finalized",
				"time_to_final",
				"accounts_created",
				"organizers_evaluated",
				"organizers_returned",
			],
		}).notNull(),
		bucket: smallint().notNull().default(0),
		count: integer().notNull().default(0),
	},
	(table) => [
		primaryKey({ columns: [table.day, table.metric, table.bucket] }),
		check("usage_counts_bucket", sql`${table.bucket} between 0 and 100`),
	],
);

// Accounts (ADR 0009). Better Auth's adapter writes these five tables and our code only reads
// them. They keep the shape Better Auth asks for, so their times are `Date` values.
const moment = () => timestamp({ withTimezone: true, mode: "date" });

/** An account: one email address and no name; Better Auth's required `name` stays empty. */
export const authUsers = pgTable("auth_users", {
	id: text().primaryKey(),
	name: text().notNull().default(""),
	email: text().notNull().unique(),
	emailVerified: boolean().notNull().default(false),
	image: text(),
	createdAt: moment().notNull().defaultNow(),
	updatedAt: moment().notNull().defaultNow(),
});

/**
 * A signed-in browser. The cookie carries the token with a signature made with `AUTH_SECRET`,
 * so the stored token alone does not open a session. `userAgent` holds the browser family
 * only and `ipAddress` stays empty.
 */
export const authSessions = pgTable(
	"auth_sessions",
	{
		id: text().primaryKey(),
		expiresAt: moment().notNull(),
		token: text().notNull().unique(),
		createdAt: moment().notNull().defaultNow(),
		updatedAt: moment().notNull().defaultNow(),
		ipAddress: text(),
		userAgent: text(),
		userId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
	},
	(table) => [index("auth_sessions_user").on(table.userId)],
);

/** Sign-in methods of an account; the email link needs none, OAuth providers later add rows. */
export const authAccounts = pgTable(
	"auth_accounts",
	{
		id: text().primaryKey(),
		accountId: text().notNull(),
		providerId: text().notNull(),
		userId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		accessToken: text(),
		refreshToken: text(),
		idToken: text(),
		accessTokenExpiresAt: moment(),
		refreshTokenExpiresAt: moment(),
		scope: text(),
		password: text(),
		createdAt: moment().notNull().defaultNow(),
		updatedAt: moment().notNull().defaultNow(),
	},
	(table) => [index("auth_accounts_user").on(table.userId)],
);

/** Sign-in links and other one-time values, stored as hashes. */
export const authVerifications = pgTable(
	"auth_verifications",
	{
		id: text().primaryKey(),
		identifier: text().notNull(),
		value: text().notNull(),
		expiresAt: moment().notNull(),
		createdAt: moment().notNull().defaultNow(),
		updatedAt: moment().notNull().defaultNow(),
	},
	(table) => [index("auth_verifications_identifier").on(table.identifier)],
);

export const authPasskeys = pgTable(
	"auth_passkeys",
	{
		id: text().primaryKey(),
		name: text(),
		publicKey: text().notNull(),
		userId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		credentialID: text().notNull(),
		counter: integer().notNull(),
		deviceType: text().notNull(),
		backedUp: boolean().notNull(),
		transports: text(),
		createdAt: moment(),
		aaguid: text(),
	},
	(table) => [
		index("auth_passkeys_user").on(table.userId),
		index("auth_passkeys_credential").on(table.credentialID),
	],
);

/** What an account chose that Better Auth does not keep: the language of its emails. */
export const accountSettings = pgTable(
	"account_settings",
	{
		accountId: text()
			.primaryKey()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		locale: text({ enum: ["cs", "en"] }).notNull(),
	},
	(table) => [check("account_settings_locale", sql`${table.locale} in ('cs', 'en')`)],
);

/**
 * Emails sent per hour, to limit them. `key` is the HMAC of an address under `AUTH_SECRET`,
 * or `all` for the instance's total, so no address is stored for a person who never signs in.
 */
export const emailCounts = pgTable(
	"email_counts",
	{
		key: text().notNull(),
		/** The start of the hour in UTC. */
		hour: instant().notNull(),
		count: integer().notNull().default(0),
	},
	(table) => [primaryKey({ columns: [table.key, table.hour] })],
);

/** What an account chose on the account page; a kind without a row is off. */
export const accountNotifications = pgTable(
	"account_notifications",
	{
		accountId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		kind: text({ enum: NOTIFICATION_KINDS }).notNull(),
		enabled: boolean().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.kind] }),
		check("account_notifications_kind", sql`${table.kind} in ('responses', 'final', 'reminder')`),
	],
);

/** What an account chose for one event; a kind without a row follows the account's choice. */
export const eventNotifications = pgTable(
	"event_notifications",
	{
		accountId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		kind: text({ enum: NOTIFICATION_KINDS }).notNull(),
		enabled: boolean().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.eventId, table.kind] }),
		index("event_notifications_event").on(table.eventId),
		check("event_notifications_kind", sql`${table.kind} in ('responses', 'final', 'reminder')`),
	],
);

/**
 * The new-responses email of one account and event once one was sent: when, and the names that
 * joined or changed since, which wait for the interval to pass.
 */
export const responseDigests = pgTable(
	"response_digests",
	{
		accountId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		sentAt: instant().notNull(),
		waiting: text()
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
	},
	(table) => [
		primaryKey({ columns: [table.accountId, table.eventId] }),
		index("response_digests_event").on(table.eventId),
	],
);

/**
 * Notification emails waiting to be sent. The address and the language are read when the email
 * goes out, so the outbox stores no address, and an email goes with its account or event.
 */
export const outboxEmails = pgTable(
	"outbox_emails",
	{
		id: bigint({ mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
		accountId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		message: jsonb().$type<OutboxMessage>().notNull(),
		/** Failed attempts so far. */
		attempts: smallint().notNull().default(0),
		nextAttemptAt: instant().notNull(),
	},
	(table) => [
		index("outbox_emails_due").on(table.nextAttemptAt),
		index("outbox_emails_account").on(table.accountId),
		index("outbox_emails_event").on(table.eventId),
		check(
			"outbox_emails_attempts",
			sql`${table.attempts} between 0 and ${sql.raw(String(MAX_ATTEMPTS - 1))}`,
		),
	],
);

/**
 * The first events of each account that ever owned one, for the count of returning organizers.
 * A trigger on `events` writes it whenever an account gains an event, so it outlives the events,
 * and it goes with the account. The maintenance pass counts each account once, when its first
 * event is old enough.
 */
export const organizers = pgTable(
	"organizers",
	{
		accountId: text()
			.primaryKey()
			.references(() => authUsers.id, { onDelete: "cascade" }),
		/** The earliest created event the account owned; an event that is deleted keeps its id here. */
		firstEventId: text().notNull(),
		firstCreatedAt: instant().notNull(),
		/** When the next earliest event the account owned was created; null while it owned one. */
		secondCreatedAt: instant(),
		/** When the maintenance pass counted the account; it changes no more after. */
		countedAt: instant(),
	},
	(table) => [
		index("organizers_due")
			.on(table.firstCreatedAt)
			.where(sql`${table.countedAt} is null`),
		check(
			"organizers_second_after_first",
			sql`${table.secondCreatedAt} is null or ${table.secondCreatedAt} >= ${table.firstCreatedAt}`,
		),
	],
);
