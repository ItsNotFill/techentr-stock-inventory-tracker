CREATE TABLE "sub_recipe_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"sub_recipe_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"child_sub_recipe_id" uuid,
	"qty_base_unit" numeric(14, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_recipe_lines_sub_recipe_id_ingredient_id_key" UNIQUE("sub_recipe_id","ingredient_id"),
	CONSTRAINT "sub_recipe_lines_sub_recipe_id_child_key" UNIQUE("sub_recipe_id","child_sub_recipe_id"),
	CONSTRAINT "sub_recipe_lines_qty_positive" CHECK ("sub_recipe_lines"."qty_base_unit" > 0),
	CONSTRAINT "sub_recipe_lines_one_target" CHECK (("sub_recipe_lines"."ingredient_id" is null) <> ("sub_recipe_lines"."child_sub_recipe_id" is null)),
	CONSTRAINT "sub_recipe_lines_not_itself" CHECK ("sub_recipe_lines"."child_sub_recipe_id" is null or "sub_recipe_lines"."child_sub_recipe_id" <> "sub_recipe_lines"."sub_recipe_id")
);
--> statement-breakpoint
ALTER TABLE "sub_recipe_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sub_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_unit" "base_unit" NOT NULL,
	"yield_qty" numeric(14, 3) NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sub_recipes_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "sub_recipes_yield_positive" CHECK ("sub_recipes"."yield_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "sub_recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_lines" DROP CONSTRAINT "recipe_lines_confirmed_has_ingredient";--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD COLUMN "sub_recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "sub_recipe_lines" ADD CONSTRAINT "sub_recipe_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_recipe_lines" ADD CONSTRAINT "sub_recipe_lines_sub_recipe_fk" FOREIGN KEY ("sub_recipe_id","location_id") REFERENCES "public"."sub_recipes"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_recipe_lines" ADD CONSTRAINT "sub_recipe_lines_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_recipe_lines" ADD CONSTRAINT "sub_recipe_lines_child_fk" FOREIGN KEY ("child_sub_recipe_id","location_id") REFERENCES "public"."sub_recipes"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_recipes" ADD CONSTRAINT "sub_recipes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sub_recipe_lines_ingredient_id_idx" ON "sub_recipe_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "sub_recipe_lines_child_sub_recipe_id_idx" ON "sub_recipe_lines" USING btree ("child_sub_recipe_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_recipes_location_id_lower_name_key" ON "sub_recipes" USING btree ("location_id",lower("name"));--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_sub_recipe_fk" FOREIGN KEY ("sub_recipe_id","location_id") REFERENCES "public"."sub_recipes"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_lines_sub_recipe_id_idx" ON "recipe_lines" USING btree ("sub_recipe_id");--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_menu_item_id_sub_recipe_id_key" UNIQUE("menu_item_id","sub_recipe_id");--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_not_both" CHECK ("recipe_lines"."ingredient_id" is null or "recipe_lines"."sub_recipe_id" is null);--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_confirmed_has_ingredient" CHECK ("recipe_lines"."confirmed_at" is null or (("recipe_lines"."ingredient_id" is not null) <> ("recipe_lines"."sub_recipe_id" is not null)));--> statement-breakpoint
CREATE POLICY "sub_recipe_lines_select_member" ON "sub_recipe_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "sub_recipe_lines_insert_role" ON "sub_recipe_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sub_recipe_lines_update_role" ON "sub_recipe_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sub_recipe_lines_delete_role" ON "sub_recipe_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sub_recipes_select_member" ON "sub_recipes" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "sub_recipes_insert_role" ON "sub_recipes" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sub_recipes_update_role" ON "sub_recipes" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "sub_recipes_delete_role" ON "sub_recipes" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));-- Hand-written: privileges (Drizzle does not manage grants). Writes are for
-- owners and managers through the RLS policies above.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_recipes TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_recipe_lines TO app_user;
