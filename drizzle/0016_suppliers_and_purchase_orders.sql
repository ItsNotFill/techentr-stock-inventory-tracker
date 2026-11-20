CREATE TYPE "public"."purchase_order_status" AS ENUM('draft', 'sent', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_id_location_id_key" UNIQUE("id","location_id")
);
--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"pack_size_id" uuid,
	"pack_count" numeric(14, 3),
	"qty_base_unit" numeric(14, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_lines_order_ingredient_key" UNIQUE("purchase_order_id","ingredient_id"),
	CONSTRAINT "purchase_order_lines_qty_positive" CHECK ("purchase_order_lines"."qty_base_unit" > 0),
	CONSTRAINT "purchase_order_lines_pack_count_positive" CHECK ("purchase_order_lines"."pack_count" is null or "purchase_order_lines"."pack_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"sent_by" uuid,
	"received_at" timestamp with time zone,
	"received_by" uuid,
	"delivery_id" uuid,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "purchase_orders_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "purchase_orders_sent_has_time" CHECK ("purchase_orders"."status" in ('draft', 'cancelled') or "purchase_orders"."sent_at" is not null),
	CONSTRAINT "purchase_orders_received_has_delivery" CHECK ("purchase_orders"."status" <> 'received' or ("purchase_orders"."received_at" is not null and "purchase_orders"."delivery_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "supplier_id" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_fk" FOREIGN KEY ("purchase_order_id","location_id") REFERENCES "public"."purchase_orders"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_pack_size_fk" FOREIGN KEY ("pack_size_id","location_id") REFERENCES "public"."pack_sizes"("id","location_id") ON DELETE SET NULL ("pack_size_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_fk" FOREIGN KEY ("supplier_id","location_id") REFERENCES "public"."suppliers"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_delivery_fk" FOREIGN KEY ("delivery_id","location_id") REFERENCES "public"."deliveries"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_location_id_lower_name_key" ON "suppliers" USING btree ("location_id",lower("name"));--> statement-breakpoint
CREATE INDEX "purchase_order_lines_ingredient_id_idx" ON "purchase_order_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_location_id_status_idx" ON "purchase_orders" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplier_fk" FOREIGN KEY ("supplier_id","location_id") REFERENCES "public"."suppliers"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredients_supplier_id_idx" ON "ingredients" USING btree ("supplier_id");--> statement-breakpoint
CREATE POLICY "suppliers_select_member" ON "suppliers" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "suppliers_insert_role" ON "suppliers" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "suppliers_update_role" ON "suppliers" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "suppliers_delete_role" ON "suppliers" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_select_member" ON "purchase_order_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_insert_draft" ON "purchase_order_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and exists (select 1 from public.purchase_orders o where o.id = "purchase_order_lines"."purchase_order_id" and o.location_id = "purchase_order_lines"."location_id" and o.status = 'draft'));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_update_draft" ON "purchase_order_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and exists (select 1 from public.purchase_orders o where o.id = "purchase_order_lines"."purchase_order_id" and o.location_id = "purchase_order_lines"."location_id" and o.status = 'draft')) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and exists (select 1 from public.purchase_orders o where o.id = "purchase_order_lines"."purchase_order_id" and o.location_id = "purchase_order_lines"."location_id" and o.status = 'draft'));--> statement-breakpoint
CREATE POLICY "purchase_order_lines_delete_draft" ON "purchase_order_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and exists (select 1 from public.purchase_orders o where o.id = "purchase_order_lines"."purchase_order_id" and o.location_id = "purchase_order_lines"."location_id" and o.status = 'draft'));--> statement-breakpoint
CREATE POLICY "purchase_orders_select_member" ON "purchase_orders" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "purchase_orders_insert_manager" ON "purchase_orders" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and "purchase_orders"."status" = 'draft');--> statement-breakpoint
CREATE POLICY "purchase_orders_update_manager" ON "purchase_orders" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "purchase_orders_delete_draft" ON "purchase_orders" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and "purchase_orders"."status" = 'draft');--> statement-breakpoint
-- Hand-written: privileges (Drizzle does not manage grants). The pack size key
-- above was edited by hand to ON DELETE SET NULL ("pack_size_id"), as for
-- delivery lines: a plain SET NULL would null location_id too.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO app_user;
