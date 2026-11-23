CREATE TABLE "account_notifications" (
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "account_notifications_account_id_kind_pk" PRIMARY KEY("account_id","kind"),
	CONSTRAINT "account_notifications_kind" CHECK ("account_notifications"."kind" in ('responses', 'final', 'reminder'))
);
--> statement-breakpoint
CREATE TABLE "event_notifications" (
	"account_id" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"enabled" boolean NOT NULL,
	CONSTRAINT "event_notifications_account_id_event_id_kind_pk" PRIMARY KEY("account_id","event_id","kind"),
	CONSTRAINT "event_notifications_kind" CHECK ("event_notifications"."kind" in ('responses', 'final', 'reminder'))
);
--> statement-breakpoint
CREATE TABLE "outbox_emails" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_emails_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"account_id" text NOT NULL,
	"event_id" text NOT NULL,
	"message" jsonb NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	CONSTRAINT "outbox_emails_attempts" CHECK ("outbox_emails"."attempts" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "response_digests" (
	"account_id" text NOT NULL,
	"event_id" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"waiting" text[] DEFAULT '{}'::text[] NOT NULL,
	CONSTRAINT "response_digests_account_id_event_id_pk" PRIMARY KEY("account_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "reminded_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_notifications" ADD CONSTRAINT "account_notifications_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_notifications" ADD CONSTRAINT "event_notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_emails" ADD CONSTRAINT "outbox_emails_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_emails" ADD CONSTRAINT "outbox_emails_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_digests" ADD CONSTRAINT "response_digests_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_digests" ADD CONSTRAINT "response_digests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notifications_event" ON "event_notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_emails_due" ON "outbox_emails" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_emails_account" ON "outbox_emails" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "outbox_emails_event" ON "outbox_emails" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "response_digests_event" ON "response_digests" USING btree ("event_id");