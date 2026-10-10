CREATE TABLE "drill_composite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"composite_score" numeric NOT NULL,
	"pass_threshold" integer DEFAULT 70 NOT NULL,
	"passed" boolean NOT NULL,
	"breakdown" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_composite_drill_id_unique" UNIQUE("drill_id"),
	CONSTRAINT "drill_composite_score_range" CHECK ("drill_composite"."composite_score" >= 0 and "drill_composite"."composite_score" <= 100)
);
--> statement-breakpoint
ALTER TABLE "drill_composite" ADD CONSTRAINT "drill_composite_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;