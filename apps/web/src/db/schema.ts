// Tables of events, participants, responses, tokens and usage counts, as in ADR 0002 and ADR 0003.
import { sql } from "drizzle-orm";
import {
	bigint,
	check,
	date,
	foreignKey,
	integer,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { LEVELS } from "@/domain/levels";
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
	},
	(table) => [
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
		/** When the last attempt was counted. The count is forgotten 15 minutes after it. */
		lastAttemptAt: instant(),
		lockedUntil: instant(),
		createdAt: instant().notNull().defaultNow(),
	},
	(table) => [
		unique("participants_event_name").on(table.eventId, table.nameKey),
		unique("participants_public_id").on(table.publicId),
		// The target of a poll answer's key, which ties the participant to the option's event.
		unique("participants_id_event").on(table.id, table.eventId),
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
