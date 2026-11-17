// Tables of Phases 1 and 2. Rules E1 to E7, P1 to P9 and R1 of the Phase 1 spec, U1 to U6
// of the Phase 2 spec, ADR 0002 and ADR 0003.
import { sql } from "drizzle-orm";
import {
	check,
	date,
	integer,
	pgTable,
	primaryKey,
	smallint,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// Column names come from the property names in snake_case; see `casing` in the client.
const instant = () => timestamp({ withTimezone: true, mode: "string" });

export const events = pgTable(
	"events",
	{
		id: text().primaryKey(),
		name: text().notNull(),
		description: text().notNull().default(""),
		dayMode: text({ enum: ["range", "dates", "weekdays"] }).notNull(),
		rangeFirst: date({ mode: "string" }),
		rangeLast: date({ mode: "string" }),
		dates: date({ mode: "string" }).array(),
		weekdays: smallint().array(),
		/** Minutes after midnight in the reference zone. */
		dailyStart: smallint().notNull(),
		dailyEnd: smallint().notNull(),
		slotLength: smallint().notNull(),
		referenceZone: text().notNull(),
		/** ISO day of week the columns start on. */
		firstDayOfWeek: smallint().notNull(),
		/** SHA-256 of the admin secret, base64url. */
		adminSecretHash: text().notNull(),
		createdAt: instant().notNull().defaultNow(),
		/** The version of Phase 2 rule F5, and the base of a weekday event's deletion date (E7). */
		changedAt: instant().notNull().defaultNow(),
		/** When the event entered the usage counts of Phase 2 rules U3, U4 and U5 (U6). */
		activationCountedAt: instant(),
		sizeCountedAt: instant(),
		firstResponseCountedAt: instant(),
	},
	(table) => [
		check(
			"events_days_match_mode",
			sql`case ${table.dayMode}
        when 'range' then ${table.rangeFirst} is not null and ${table.rangeLast} is not null
          and ${table.dates} is null and ${table.weekdays} is null
        when 'dates' then ${table.dates} is not null
          and ${table.rangeFirst} is null and ${table.rangeLast} is null and ${table.weekdays} is null
        else ${table.weekdays} is not null
          and ${table.rangeFirst} is null and ${table.rangeLast} is null and ${table.dates} is null
      end`,
		),
		check(
			"events_daily_range",
			sql`${table.dailyStart} >= 0 and ${table.dailyEnd} <= 1440 and ${table.dailyStart} < ${table.dailyEnd}`,
		),
		check("events_slot_length", sql`${table.slotLength} in (15, 30, 60)`),
		check("events_first_day_of_week", sql`${table.firstDayOfWeek} between 1 and 7`),
	],
);

export const participants = pgTable(
	"participants",
	{
		id: uuid()
			.primaryKey()
			.default(sql`uuidv7()`),
		eventId: text()
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		displayName: text().notNull(),
		/** The display name lower-cased, for rule P2. */
		nameKey: text().notNull(),
		/** Argon2id hash in PHC string format. */
		passwordHash: text(),
		failedAttempts: smallint().notNull().default(0),
		lockedUntil: instant(),
		createdAt: instant().notNull().defaultNow(),
	},
	(table) => [unique("participants_event_name").on(table.eventId, table.nameKey)],
);

export const participantTokens = pgTable("participant_tokens", {
	/** SHA-256 of the token, base64url. */
	tokenHash: text().primaryKey(),
	participantId: uuid()
		.notNull()
		.references(() => participants.id, { onDelete: "cascade" }),
	createdAt: instant().notNull().defaultNow(),
});

export const datedAvailability = pgTable(
	"dated_availability",
	{
		participantId: uuid()
			.notNull()
			.references(() => participants.id, { onDelete: "cascade" }),
		slotStart: instant().notNull(),
	},
	(table) => [primaryKey({ columns: [table.participantId, table.slotStart] })],
);

export const weekdayAvailability = pgTable(
	"weekday_availability",
	{
		participantId: uuid()
			.notNull()
			.references(() => participants.id, { onDelete: "cascade" }),
		weekday: smallint().notNull(),
		minute: smallint().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.participantId, table.weekday, table.minute] }),
		check("weekday_availability_weekday", sql`${table.weekday} between 1 and 7`),
		check("weekday_availability_minute", sql`${table.minute} between 0 and 1439`),
	],
);

/**
 * Daily usage counts of Phase 2 rules U1 to U5. No column names an event. `bucket` is 0 for a
 * plain count, the participant count for `group_size`, and the bucket index of U5 for
 * `first_response`.
 */
export const usageCounts = pgTable(
	"usage_counts",
	{
		/** A calendar day in UTC. */
		day: date({ mode: "string" }).notNull(),
		metric: text({
			enum: ["events_created", "activation_evaluated", "activated", "group_size", "first_response"],
		}).notNull(),
		bucket: smallint().notNull().default(0),
		count: integer().notNull().default(0),
	},
	(table) => [
		primaryKey({ columns: [table.day, table.metric, table.bucket] }),
		check("usage_counts_bucket", sql`${table.bucket} between 0 and 100`),
	],
);
