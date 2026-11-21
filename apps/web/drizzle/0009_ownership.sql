ALTER TABLE "events" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_auth_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_owner" ON "events" USING btree ("owner_id");