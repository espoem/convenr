ALTER TABLE "participants" ADD COLUMN "public_id" text;--> statement-breakpoint
-- Existing participants get 12 characters from the event id alphabet. The reference to the
-- outer row makes PostgreSQL draw a new id per row instead of one for the whole table.
UPDATE "participants" SET "public_id" = (
	SELECT string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 1 + floor(random() * 57)::int, 1), '')
	FROM generate_series(1, 12)
	WHERE "participants"."id" IS NOT NULL
);--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_public_id" UNIQUE("public_id");
