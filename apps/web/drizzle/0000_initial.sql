CREATE TABLE "dated_availability" (
	"participant_id" uuid NOT NULL,
	"slot_start" timestamp with time zone NOT NULL,
	CONSTRAINT "dated_availability_participant_id_slot_start_pk" PRIMARY KEY("participant_id","slot_start")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"day_mode" text NOT NULL,
	"range_first" date,
	"range_last" date,
	"dates" date[],
	"weekdays" smallint[],
	"daily_start" smallint NOT NULL,
	"daily_end" smallint NOT NULL,
	"slot_length" smallint NOT NULL,
	"reference_zone" text NOT NULL,
	"first_day_of_week" smallint NOT NULL,
	"admin_secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activation_counted_at" timestamp with time zone,
	"size_counted_at" timestamp with time zone,
	"first_response_counted_at" timestamp with time zone,
	CONSTRAINT "events_days_match_mode" CHECK (case "events"."day_mode"
        when 'range' then "events"."range_first" is not null and "events"."range_last" is not null
          and "events"."dates" is null and "events"."weekdays" is null
        when 'dates' then "events"."dates" is not null
          and "events"."range_first" is null and "events"."range_last" is null and "events"."weekdays" is null
        else "events"."weekdays" is not null
          and "events"."range_first" is null and "events"."range_last" is null and "events"."dates" is null
      end),
	CONSTRAINT "events_daily_range" CHECK ("events"."daily_start" >= 0 and "events"."daily_end" <= 1440 and "events"."daily_start" < "events"."daily_end"),
	CONSTRAINT "events_slot_length" CHECK ("events"."slot_length" in (15, 30, 60)),
	CONSTRAINT "events_first_day_of_week" CHECK ("events"."first_day_of_week" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "participant_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" text NOT NULL,
	"display_name" text NOT NULL,
	"name_key" text NOT NULL,
	"password_hash" text,
	"failed_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_event_name" UNIQUE("event_id","name_key")
);
--> statement-breakpoint
CREATE TABLE "usage_counts" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"bucket" smallint DEFAULT 0 NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counts_day_metric_bucket_pk" PRIMARY KEY("day","metric","bucket"),
	CONSTRAINT "usage_counts_bucket" CHECK ("usage_counts"."bucket" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "weekday_availability" (
	"participant_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"minute" smallint NOT NULL,
	CONSTRAINT "weekday_availability_participant_id_weekday_minute_pk" PRIMARY KEY("participant_id","weekday","minute"),
	CONSTRAINT "weekday_availability_weekday" CHECK ("weekday_availability"."weekday" between 1 and 7),
	CONSTRAINT "weekday_availability_minute" CHECK ("weekday_availability"."minute" between 0 and 1439)
);
--> statement-breakpoint
ALTER TABLE "dated_availability" ADD CONSTRAINT "dated_availability_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_tokens" ADD CONSTRAINT "participant_tokens_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekday_availability" ADD CONSTRAINT "weekday_availability_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;