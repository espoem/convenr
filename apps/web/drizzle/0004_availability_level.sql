ALTER TABLE "dated_availability" ADD COLUMN "level" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekday_availability" ADD COLUMN "level" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "dated_availability" ADD CONSTRAINT "dated_availability_level" CHECK ("dated_availability"."level" in ('available', 'if_need_be'));--> statement-breakpoint
ALTER TABLE "weekday_availability" ADD CONSTRAINT "weekday_availability_level" CHECK ("weekday_availability"."level" in ('available', 'if_need_be'));