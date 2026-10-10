CREATE TABLE "drill_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text DEFAULT 'general' NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"estimated_duration_minutes" integer DEFAULT 30 NOT NULL,
	"difficulty" text DEFAULT 'intermediate' NOT NULL,
	"based_on" text,
	"is_quick_drill" boolean DEFAULT false NOT NULL,
	"scenario" jsonb NOT NULL,
	"objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"competency_areas_tested" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_templates_type_check" CHECK ("drill_templates"."type" in ('tabletop', 'functional', 'full_scale')),
	CONSTRAINT "drill_templates_difficulty_check" CHECK ("drill_templates"."difficulty" in ('beginner', 'intermediate', 'advanced'))
);
