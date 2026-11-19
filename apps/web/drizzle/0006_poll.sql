CREATE TABLE "poll_availability" (
	"participant_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"option_id" text NOT NULL,
	"level" text NOT NULL,
	CONSTRAINT "poll_availability_participant_id_option_id_pk" PRIMARY KEY("participant_id","option_id"),
	CONSTRAINT "poll_availability_level" CHECK ("poll_availability"."level" in ('available', 'if_need_be'))
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"event_id" text NOT NULL,
	"id" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL,
	CONSTRAINT "poll_options_event_id_id_pk" PRIMARY KEY("event_id","id"),
	CONSTRAINT "poll_options_times" UNIQUE("event_id","start","end"),
	CONSTRAINT "poll_options_end_after_start" CHECK ("poll_options"."start" < "poll_options"."end")
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_days_match_mode";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "day_mode" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "daily_start" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "daily_end" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "slot_length" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "first_day_of_week" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "kind" text DEFAULT 'grid' NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_id_event" UNIQUE("id","event_id");--> statement-breakpoint
ALTER TABLE "poll_availability" ADD CONSTRAINT "poll_availability_participant" FOREIGN KEY ("participant_id","event_id") REFERENCES "public"."participants"("id","event_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_availability" ADD CONSTRAINT "poll_availability_option" FOREIGN KEY ("event_id","option_id") REFERENCES "public"."poll_options"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_schedule_matches_kind" CHECK (case "events"."kind"
        when 'poll' then "events"."day_mode" is null and "events"."range_first" is null
          and "events"."range_last" is null and "events"."dates" is null and "events"."weekdays" is null
          and "events"."daily_start" is null and "events"."daily_end" is null
          and "events"."slot_length" is null and "events"."first_day_of_week" is null
        when 'grid' then "events"."daily_start" is not null and "events"."daily_end" is not null
          and "events"."slot_length" is not null and "events"."first_day_of_week" is not null
          and case "events"."day_mode"
            when 'range' then "events"."range_first" is not null and "events"."range_last" is not null
              and "events"."dates" is null and "events"."weekdays" is null
            when 'dates' then "events"."dates" is not null
              and "events"."range_first" is null and "events"."range_last" is null and "events"."weekdays" is null
            when 'weekdays' then "events"."weekdays" is not null
              and "events"."range_first" is null and "events"."range_last" is null and "events"."dates" is null
            else false
          end
        else false
      end);