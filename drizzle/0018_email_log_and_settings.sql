CREATE TYPE "public"."email_kind" AS ENUM('weekly_summary', 'low_stock');--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"kind" "email_kind" NOT NULL,
	"period" text NOT NULL,
	"status" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"signature" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_location_kind_period_key" UNIQUE("location_id","kind","period"),
	CONSTRAINT "email_log_status" CHECK ("email_log"."status" in ('sent', 'skipped', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "email_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "weekly_summary_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "low_stock_alerts_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_location_id_kind_created_at_idx" ON "email_log" USING btree ("location_id","kind","created_at");--> statement-breakpoint
CREATE POLICY "email_log_select_member" ON "email_log" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
-- Hand-written: the app role only reads the log; the cron jobs write it
-- through the admin connection (DECISIONS.md 99).
GRANT SELECT ON public.email_log TO app_user;
