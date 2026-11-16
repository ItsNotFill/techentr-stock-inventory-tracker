CREATE TYPE "public"."ai_extraction_kind" AS ENUM('menu_screenshot', 'recipe_draft', 'eod_report', 'supplier_invoice');--> statement-breakpoint
CREATE TYPE "public"."ai_extraction_status" AS ENUM('draft', 'confirmed', 'discarded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."base_unit" AS ENUM('g', 'ml', 'unit');--> statement-breakpoint
CREATE TYPE "public"."count_status" AS ENUM('draft', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."delivery_source" AS ENUM('manual', 'invoice_photo');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'confirmed', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."import_source" AS ENUM('csv', 'photo');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('draft', 'confirmed', 'undone');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'manager', 'staff');--> statement-breakpoint
CREATE TYPE "public"."menu_item_kind" AS ENUM('item', 'modifier');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('sale', 'delivery', 'waste', 'count_adjust');--> statement-breakpoint
CREATE TYPE "public"."recipe_line_source" AS ENUM('manual', 'ai');--> statement-breakpoint
CREATE TYPE "public"."waste_reason" AS ENUM('expired', 'dropped', 'burnt', 'other');--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"pos_provider" text,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_location_id_pk" PRIMARY KEY("user_id","location_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "locations_org_id_idx" ON "locations" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "memberships_location_id_idx" ON "memberships" USING btree ("location_id");