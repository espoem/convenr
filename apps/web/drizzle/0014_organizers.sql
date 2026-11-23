CREATE TABLE "organizers" (
	"account_id" text PRIMARY KEY NOT NULL,
	"first_event_id" text NOT NULL,
	"first_created_at" timestamp with time zone NOT NULL,
	"second_created_at" timestamp with time zone,
	"counted_at" timestamp with time zone,
	CONSTRAINT "organizers_second_after_first" CHECK ("organizers"."second_created_at" is null or "organizers"."second_created_at" >= "organizers"."first_created_at")
);
--> statement-breakpoint
ALTER TABLE "organizers" ADD CONSTRAINT "organizers_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organizers_due" ON "organizers" USING btree ("first_created_at") WHERE "organizers"."counted_at" is null;--> statement-breakpoint
-- Every account Better Auth creates adds one to the day's count, in the same transaction.
CREATE FUNCTION "count_account_created"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO usage_counts (day, metric, bucket, count)
	VALUES ((NEW.created_at AT TIME ZONE 'UTC')::date, 'accounts_created', 0, 1)
	ON CONFLICT (day, metric, bucket) DO UPDATE SET count = usage_counts.count + 1;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "auth_users_counted"
AFTER INSERT ON "auth_users"
FOR EACH ROW
EXECUTE FUNCTION "count_account_created"();
--> statement-breakpoint
-- An account that gains an event, by creating or claiming it, keeps its two earliest created
-- events. An event counts from its creation, so a claimed older event can become the first one.
-- The same event gained again changes nothing, and a counted account changes no more.
CREATE FUNCTION "note_organizer_event"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	INSERT INTO organizers (account_id, first_event_id, first_created_at)
	VALUES (NEW.owner_id, NEW.id, NEW.created_at)
	ON CONFLICT (account_id) DO UPDATE SET
		first_event_id = CASE
			WHEN excluded.first_created_at < organizers.first_created_at THEN excluded.first_event_id
			ELSE organizers.first_event_id END,
		first_created_at = least(organizers.first_created_at, excluded.first_created_at),
		second_created_at = CASE
			WHEN excluded.first_event_id = organizers.first_event_id THEN organizers.second_created_at
			WHEN excluded.first_created_at < organizers.first_created_at THEN organizers.first_created_at
			ELSE least(organizers.second_created_at, excluded.first_created_at) END
	WHERE organizers.counted_at IS NULL;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "events_owner_created"
AFTER INSERT ON "events"
FOR EACH ROW
WHEN (NEW."owner_id" IS NOT NULL)
EXECUTE FUNCTION "note_organizer_event"();
--> statement-breakpoint
CREATE TRIGGER "events_owner_gained"
AFTER UPDATE OF "owner_id" ON "events"
FOR EACH ROW
WHEN (NEW."owner_id" IS NOT NULL AND NEW."owner_id" IS DISTINCT FROM OLD."owner_id")
EXECUTE FUNCTION "note_organizer_event"();
--> statement-breakpoint
-- Accounts that own events already start from the events they own now.
INSERT INTO organizers (account_id, first_event_id, first_created_at, second_created_at)
SELECT
	owner_id,
	(array_agg(id ORDER BY created_at, id))[1],
	min(created_at),
	(array_agg(created_at ORDER BY created_at, id))[2]
FROM events
WHERE owner_id IS NOT NULL
GROUP BY owner_id;