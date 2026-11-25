ALTER TABLE "participants" ADD COLUMN "attempt_cycle" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "attempt_refunds" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_failed_attempts" CHECK ("participants"."failed_attempts" >= 0);