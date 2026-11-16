CREATE TABLE "pos_import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"pos_provider" text NOT NULL,
	"column_map" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pos_import_mappings_location_id_pos_provider_key" UNIQUE("location_id","pos_provider")
);
--> statement-breakpoint
ALTER TABLE "pos_import_mappings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"depleted_at" timestamp with time zone,
	CONSTRAINT "sale_lines_qty_not_zero" CHECK ("sale_lines"."qty" <> 0)
);
--> statement-breakpoint
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"pos_order_id" text NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_location_id_pos_order_id_key" UNIQUE("location_id","pos_order_id"),
	CONSTRAINT "sales_id_location_id_key" UNIQUE("id","location_id")
);
--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sales_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"source" "import_source" NOT NULL,
	"status" "import_status" NOT NULL,
	"file_name" text,
	"photo_path" text,
	"ai_extraction_id" uuid,
	"business_date" date,
	"imported_by" uuid NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"unmapped_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"undone_by" uuid,
	"undone_at" timestamp with time zone,
	CONSTRAINT "sales_imports_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "sales_imports_photo_has_path_and_date" CHECK ("sales_imports"."source" <> 'photo' or ("sales_imports"."photo_path" is not null and "sales_imports"."business_date" is not null))
);
--> statement-breakpoint
ALTER TABLE "sales_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pos_import_mappings" ADD CONSTRAINT "pos_import_mappings_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_import_mappings" ADD CONSTRAINT "pos_import_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_fk" FOREIGN KEY ("sale_id","location_id") REFERENCES "public"."sales"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_menu_item_fk" FOREIGN KEY ("menu_item_id","location_id") REFERENCES "public"."menu_items"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_import_fk" FOREIGN KEY ("import_id","location_id") REFERENCES "public"."sales_imports"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_imports" ADD CONSTRAINT "sales_imports_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sale_lines_sale_id_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_lines_undepleted_idx" ON "sale_lines" USING btree ("menu_item_id") WHERE "sale_lines"."depleted_at" is null;--> statement-breakpoint
CREATE INDEX "sales_location_id_sold_at_idx" ON "sales" USING btree ("location_id","sold_at");--> statement-breakpoint
CREATE INDEX "sales_import_id_idx" ON "sales" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "sales_imports_location_id_created_at_idx" ON "sales_imports" USING btree ("location_id","created_at");--> statement-breakpoint
CREATE POLICY "pos_import_mappings_select_member" ON "pos_import_mappings" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "pos_import_mappings_insert_role" ON "pos_import_mappings" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "pos_import_mappings_update_role" ON "pos_import_mappings" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "pos_import_mappings_delete_role" ON "pos_import_mappings" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sale_lines_select_member" ON "sale_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "sale_lines_insert_role" ON "sale_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sale_lines_update_role" ON "sale_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sale_lines_delete_role" ON "sale_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_select_member" ON "sales" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "sales_insert_role" ON "sales" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_update_role" ON "sales" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_delete_role" ON "sales" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_imports_select_member" ON "sales_imports" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "sales_imports_insert_role" ON "sales_imports" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_imports_update_role" ON "sales_imports" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sales_imports_delete_role" ON "sales_imports" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
-- Hand-written: privileges for the app role (Drizzle does not generate grants).
-- No DELETE on sales data: a sale is only ever removed by undo_sales_import(),
-- which also removes its stock movements.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_import_mappings TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.sales_imports TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT ON public.sales TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON public.sale_lines TO app_user;
