CREATE TABLE "ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_unit" "base_unit" NOT NULL,
	"cost_per_base_unit" numeric(12, 6) DEFAULT '0' NOT NULL,
	"par_level" numeric(14, 3),
	"reorder_point" numeric(14, 3),
	"category" text,
	"storage_area" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingredients_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "ingredients_cost_not_negative" CHECK ("ingredients"."cost_per_base_unit" >= 0),
	CONSTRAINT "ingredients_par_level_not_negative" CHECK ("ingredients"."par_level" is null or "ingredients"."par_level" >= 0),
	CONSTRAINT "ingredients_reorder_point_not_negative" CHECK ("ingredients"."reorder_point" is null or "ingredients"."reorder_point" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ingredients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pack_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"label" text NOT NULL,
	"qty_in_base_unit" numeric(14, 3) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_sizes_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "pack_sizes_ingredient_id_label_key" UNIQUE("ingredient_id","label"),
	CONSTRAINT "pack_sizes_qty_positive" CHECK ("pack_sizes"."qty_in_base_unit" > 0)
);
--> statement-breakpoint
ALTER TABLE "pack_sizes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_sizes" ADD CONSTRAINT "pack_sizes_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingredients_location_id_lower_name_key" ON "ingredients" USING btree ("location_id",lower("name"));--> statement-breakpoint
CREATE INDEX "ingredients_location_id_storage_area_idx" ON "ingredients" USING btree ("location_id","storage_area");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_sizes_one_default_per_ingredient" ON "pack_sizes" USING btree ("ingredient_id") WHERE "pack_sizes"."is_default";--> statement-breakpoint
CREATE POLICY "ingredients_select_member" ON "ingredients" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "ingredients_insert_role" ON "ingredients" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "ingredients_update_role" ON "ingredients" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "ingredients_delete_role" ON "ingredients" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "pack_sizes_select_member" ON "pack_sizes" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "pack_sizes_insert_role" ON "pack_sizes" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "pack_sizes_update_role" ON "pack_sizes" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "pack_sizes_delete_role" ON "pack_sizes" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
-- Hand-written: privileges for the app role (Drizzle does not generate grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingredients TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pack_sizes TO app_user;
