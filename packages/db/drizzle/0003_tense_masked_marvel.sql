CREATE TABLE "drill_injects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"description" text NOT NULL,
	"trigger_at_minutes" integer DEFAULT 0 NOT NULL,
	"inject_type" text DEFAULT 'alert' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fired" boolean DEFAULT false NOT NULL,
	"fired_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "drill_injects_inject_type_check" CHECK ("drill_injects"."inject_type" in ('metric_spike', 'log_flood', 'alert', 'comms'))
);
--> statement-breakpoint
ALTER TABLE "drill_injects" ADD CONSTRAINT "drill_injects_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_injects_drill_id_idx" ON "drill_injects" USING btree ("drill_id","trigger_at_minutes");