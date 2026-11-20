-- Live updates (ADR 0006): every change of an event's version, and its deletion, is announced on
-- the channel `event_version` when the transaction commits. The payload is the event id and the
-- new version as text, or the id alone once the event is gone.
CREATE FUNCTION "notify_event_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM pg_notify('event_version', json_build_object('id', OLD.id)::text);
		RETURN OLD;
	END IF;

	PERFORM pg_notify(
		'event_version',
		json_build_object('id', NEW.id, 'version', NEW.version::text)::text
	);
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "events_version_changed"
AFTER UPDATE OF "version" ON "events"
FOR EACH ROW
WHEN (OLD."version" IS DISTINCT FROM NEW."version")
EXECUTE FUNCTION "notify_event_version"();
--> statement-breakpoint
CREATE TRIGGER "events_deleted"
AFTER DELETE ON "events"
FOR EACH ROW
EXECUTE FUNCTION "notify_event_version"();
