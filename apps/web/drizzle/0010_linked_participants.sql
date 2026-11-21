ALTER TABLE "participants" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_account_id_auth_users_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participants_account" ON "participants" USING btree ("account_id");--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_event_account" UNIQUE("event_id","account_id");