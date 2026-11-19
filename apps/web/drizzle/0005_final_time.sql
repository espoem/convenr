ALTER TABLE "events" ADD COLUMN "final_state" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_counted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_final" CHECK (case "events"."final_state"
        when 'open' then "events"."final_start" is null and "events"."final_end" is null
        when 'chosen' then "events"."final_start" is not null and "events"."final_end" is not null
          and "events"."final_start" < "events"."final_end"
        else false
      end);--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_final_sequence" CHECK ("events"."final_sequence" >= 0);