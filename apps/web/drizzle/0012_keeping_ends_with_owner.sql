-- Only an owned event is kept (check events_kept_by_owner). Whenever a kept event loses its
-- owner, by release or because the account is deleted and the foreign key sets the owner to
-- null, the keeping ends at that moment, so the event gets a full retention period from then.
-- The change moves the version like any change, because the event page shows the new deletion
-- date.
CREATE FUNCTION "end_keeping_without_owner"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	NEW.kept_until := now();
	NEW.version := OLD.version + 1;
	NEW.changed_at := now();
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "events_keeping_ends_with_owner"
BEFORE UPDATE OF "owner_id" ON "events"
FOR EACH ROW
WHEN (NEW."owner_id" IS NULL AND OLD."kept_until" = 'infinity')
EXECUTE FUNCTION "end_keeping_without_owner"();
--> statement-breakpoint
-- A column trigger fires only when the UPDATE names the column, not when a BEFORE trigger such
-- as the one above changes it. Announcing every update whose version differs covers both.
DROP TRIGGER "events_version_changed" ON "events";
--> statement-breakpoint
CREATE TRIGGER "events_version_changed"
AFTER UPDATE ON "events"
FOR EACH ROW
WHEN (OLD."version" IS DISTINCT FROM NEW."version")
EXECUTE FUNCTION "notify_event_version"();
