CREATE TABLE "drill_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor" text,
	"channel" text,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_events_event_type_check" CHECK ("drill_events"."event_type" in ('message', 'action', 'inject', 'signal', 'score', 'system'))
);
--> statement-breakpoint
CREATE TABLE "drill_lifecycle_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drill_objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"description" text NOT NULL,
	"criteria_type" text NOT NULL,
	"target_value" jsonb,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "drill_objectives_criteria_type_check" CHECK ("drill_objectives"."criteria_type" in ('time_to_action', 'completeness', 'quality', 'accuracy', 'coordination'))
);
--> statement-breakpoint
CREATE TABLE "drill_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'responder' NOT NULL,
	"joined_at" timestamp with time zone,
	CONSTRAINT "drill_participants_role_check" CHECK ("drill_participants"."role" in ('incident_commander', 'responder', 'observer', 'evaluator'))
);
--> statement-breakpoint
CREATE TABLE "drill_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"objective_id" uuid,
	"criteria_type" text NOT NULL,
	"raw_value" numeric,
	"normalized_score" numeric,
	"evidence" jsonb,
	"scored_by" text,
	"scored_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "drill_scores_criteria_type_check" CHECK ("drill_scores"."criteria_type" in ('time_to_action', 'completeness', 'quality', 'accuracy', 'coordination')),
	CONSTRAINT "drill_scores_normalized_score_range" CHECK ("drill_scores"."normalized_score" is null or ("drill_scores"."normalized_score" >= 0 and "drill_scores"."normalized_score" <= 100))
);
--> statement-breakpoint
CREATE TABLE "drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text,
	"scenario" jsonb,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drills_type_check" CHECK ("drills"."type" in ('tabletop', 'functional', 'full_scale')),
	CONSTRAINT "drills_status_check" CHECK ("drills"."status" in ('draft', 'scheduled', 'briefing', 'active', 'scoring', 'debriefing', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "improvement_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"gap_description" text NOT NULL,
	"action_description" text NOT NULL,
	"category" text,
	"severity" text DEFAULT 'P3' NOT NULL,
	"owner_id" uuid,
	"due_date" date,
	"status" text DEFAULT 'open' NOT NULL,
	"verification_method" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "improvement_actions_category_check" CHECK ("improvement_actions"."category" is null or "improvement_actions"."category" in ('process', 'tooling', 'knowledge', 'staffing', 'design')),
	CONSTRAINT "improvement_actions_severity_check" CHECK ("improvement_actions"."severity" in ('P1', 'P2', 'P3', 'P4')),
	CONSTRAINT "improvement_actions_status_check" CHECK ("improvement_actions"."status" in ('open', 'in_progress', 'completed', 'verified', 'deferred'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"sector" text DEFAULT 'technology' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_sector_check" CHECK ("organizations"."sector" in ('technology', 'healthcare', 'public_sector'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'participant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'drill_manager', 'participant', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "drill_events" ADD CONSTRAINT "drill_events_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_lifecycle_templates" ADD CONSTRAINT "drill_lifecycle_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_objectives" ADD CONSTRAINT "drill_objectives_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_participants" ADD CONSTRAINT "drill_participants_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_participants" ADD CONSTRAINT "drill_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_scores" ADD CONSTRAINT "drill_scores_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_scores" ADD CONSTRAINT "drill_scores_objective_id_drill_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."drill_objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drills" ADD CONSTRAINT "drills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_events_drill_id_occurred_at_idx" ON "drill_events" USING btree ("drill_id","occurred_at");--> statement-breakpoint
CREATE INDEX "drill_lifecycle_templates_org_id_idx" ON "drill_lifecycle_templates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "drill_objectives_drill_id_idx" ON "drill_objectives" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "drill_participants_drill_id_idx" ON "drill_participants" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "drill_scores_drill_id_idx" ON "drill_scores" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "drills_org_id_idx" ON "drills" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "drills_status_idx" ON "drills" USING btree ("status");--> statement-breakpoint
CREATE INDEX "improvement_actions_drill_id_idx" ON "improvement_actions" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "users_org_id_idx" ON "users" USING btree ("org_id");