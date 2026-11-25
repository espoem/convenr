DROP INDEX "auth_accounts_user";--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_identity" UNIQUE("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_provider" UNIQUE("user_id","provider_id");