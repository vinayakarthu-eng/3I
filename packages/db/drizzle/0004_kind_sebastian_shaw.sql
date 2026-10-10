CREATE TABLE "competency_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'technical' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "competency_areas_name_unique" UNIQUE("name"),
	CONSTRAINT "competency_areas_category_check" CHECK ("competency_areas"."category" in ('technical', 'communication', 'leadership', 'process'))
);
--> statement-breakpoint
ALTER TABLE "drill_objectives" ADD COLUMN "competency_area_id" uuid;--> statement-breakpoint
ALTER TABLE "drill_scores" ADD COLUMN "competency_area_id" uuid;--> statement-breakpoint
ALTER TABLE "drill_objectives" ADD CONSTRAINT "drill_objectives_competency_area_id_competency_areas_id_fk" FOREIGN KEY ("competency_area_id") REFERENCES "public"."competency_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_scores" ADD CONSTRAINT "drill_scores_competency_area_id_competency_areas_id_fk" FOREIGN KEY ("competency_area_id") REFERENCES "public"."competency_areas"("id") ON DELETE set null ON UPDATE no action;