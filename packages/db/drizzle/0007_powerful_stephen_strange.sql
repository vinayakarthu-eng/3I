CREATE TABLE "compliance_frameworks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"version" text NOT NULL,
	"description" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" text NOT NULL,
	"clause" text NOT NULL,
	"description" text NOT NULL,
	"evidence_type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "compliance_requirements_evidence_type_check" CHECK ("compliance_requirements"."evidence_type" in ('drill_completion', 'score_threshold', 'competency', 'certification', 'frequency'))
);
--> statement-breakpoint
CREATE TABLE "drill_compliance_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"requirement_id" uuid NOT NULL,
	"status" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drill_compliance_evidence_status_check" CHECK ("drill_compliance_evidence"."status" in ('met', 'partial', 'not_met'))
);
--> statement-breakpoint
ALTER TABLE "compliance_requirements" ADD CONSTRAINT "compliance_requirements_framework_id_compliance_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."compliance_frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_compliance_evidence" ADD CONSTRAINT "drill_compliance_evidence_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_compliance_evidence" ADD CONSTRAINT "drill_compliance_evidence_requirement_id_compliance_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."compliance_requirements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compliance_requirements_framework_id_idx" ON "compliance_requirements" USING btree ("framework_id");--> statement-breakpoint
CREATE INDEX "drill_compliance_evidence_drill_id_idx" ON "drill_compliance_evidence" USING btree ("drill_id");--> statement-breakpoint
CREATE INDEX "drill_compliance_evidence_requirement_id_idx" ON "drill_compliance_evidence" USING btree ("requirement_id");