CREATE TABLE "slack_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text NOT NULL,
	"enterprise_id" text,
	"bot_user_id" text NOT NULL,
	"bot_token_encrypted" text NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"installed_by" uuid,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slack_installations_org_id_unique" UNIQUE("org_id"),
	CONSTRAINT "slack_installations_team_id_unique" UNIQUE("team_id")
);
--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_installed_by_users_id_fk" FOREIGN KEY ("installed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;