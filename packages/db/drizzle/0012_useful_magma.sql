CREATE TABLE "drill_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drill_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"service" text NOT NULL,
	"rate_per_minute" integer NOT NULL,
	"failures_per_minute" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer NOT NULL,
	"start_offset_minutes" integer DEFAULT 0 NOT NULL,
	"pattern" text DEFAULT 'steady' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"stats" jsonb,
	"last_error" text,
	CONSTRAINT "drill_signals_kind_check" CHECK ("drill_signals"."kind" in ('http_errors', 'latency_spike', 'error_logs', 'db_query_failures', 'db_connection_exhaustion', 'db_slow_queries', 'replica_lag', 'alert_event')),
	CONSTRAINT "drill_signals_pattern_check" CHECK ("drill_signals"."pattern" in ('steady', 'ramp', 'spike', 'sawtooth')),
	CONSTRAINT "drill_signals_status_check" CHECK ("drill_signals"."status" in ('planned', 'running', 'completed', 'stopped', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "drill_signals" ADD CONSTRAINT "drill_signals_drill_id_drills_id_fk" FOREIGN KEY ("drill_id") REFERENCES "public"."drills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drill_signals_drill_id_idx" ON "drill_signals" USING btree ("drill_id","sort_order");