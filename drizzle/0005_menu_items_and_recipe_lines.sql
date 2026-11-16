CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"pos_item_id" text,
	"pos_name" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" "menu_item_kind" DEFAULT 'item' NOT NULL,
	"category" text,
	"price" numeric(12, 2),
	"is_mapped" boolean DEFAULT false NOT NULL,
	"is_ignored" boolean DEFAULT false NOT NULL,
	"ai_extraction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "menu_items_price_not_negative" CHECK ("menu_items"."price" is null or "menu_items"."price" >= 0),
	CONSTRAINT "menu_items_mapped_or_ignored" CHECK (not ("menu_items"."is_mapped" and "menu_items"."is_ignored"))
);
--> statement-breakpoint
ALTER TABLE "menu_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"draft_ingredient_name" text,
	"draft_base_unit" "base_unit",
	"qty_base_unit" numeric(14, 3) NOT NULL,
	"source" "recipe_line_source" DEFAULT 'manual' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_lines_menu_item_id_ingredient_id_key" UNIQUE("menu_item_id","ingredient_id"),
	CONSTRAINT "recipe_lines_qty_positive" CHECK ("recipe_lines"."qty_base_unit" > 0),
	CONSTRAINT "recipe_lines_confirmed_has_ingredient" CHECK ("recipe_lines"."confirmed_at" is null or "recipe_lines"."ingredient_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "recipe_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menu_item_fk" FOREIGN KEY ("menu_item_id","location_id") REFERENCES "public"."menu_items"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_location_id_pos_item_id_key" ON "menu_items" USING btree ("location_id","pos_item_id") WHERE "menu_items"."pos_item_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_items_location_id_lower_pos_name_key" ON "menu_items" USING btree ("location_id",lower("pos_name")) WHERE "menu_items"."pos_item_id" is null;--> statement-breakpoint
CREATE INDEX "menu_items_unmapped_idx" ON "menu_items" USING btree ("location_id") WHERE not "menu_items"."is_mapped" and not "menu_items"."is_ignored";--> statement-breakpoint
CREATE INDEX "recipe_lines_ingredient_id_idx" ON "recipe_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE POLICY "menu_items_select_member" ON "menu_items" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "menu_items_insert_role" ON "menu_items" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "menu_items_update_role" ON "menu_items" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "menu_items_delete_role" ON "menu_items" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "recipe_lines_select_member" ON "recipe_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "recipe_lines_insert_role" ON "recipe_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "recipe_lines_update_role" ON "recipe_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "recipe_lines_delete_role" ON "recipe_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
-- Hand-written: privileges for the app role (Drizzle does not generate grants).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_lines TO app_user;
