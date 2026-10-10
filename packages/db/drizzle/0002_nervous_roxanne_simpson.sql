CREATE TABLE "drill_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"report_type" text DEFAULT 'aar' NOT NULL,
	"content" jsonb NOT NULL,
	"generated_by" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	CONSTRAINT "drill_reports_report_type_check" CHECK ("drill_reports"."report_type" in ('aar'))
);
--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN "deferral_justification" text;--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "drill_reports" ADD CONSTRAINT "drill_reports_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drill_reports" ADD CONSTRAINT "drill_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_reports_drill_id_idx" ON "drill_reports" USING btree ("drill_id","generated_at");--> statement-breakpoint
ALTER TABLE "improvement_actions" ADD CONSTRAINT "improvement_actions_report_id_drill_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."drill_reports"("id") ON DELETE set null ON UPDATE no action;