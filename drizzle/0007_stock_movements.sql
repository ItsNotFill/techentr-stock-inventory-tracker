CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_delta" numeric(14, 3) NOT NULL,
	"type" "movement_type" NOT NULL,
	"ref_table" text,
	"ref_id" uuid,
	"waste_reason" "waste_reason",
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_qty_not_zero" CHECK ("stock_movements"."qty_delta" <> 0),
	CONSTRAINT "stock_movements_waste_has_reason" CHECK (("stock_movements"."type" = 'waste') = ("stock_movements"."waste_reason" is not null)),
	CONSTRAINT "stock_movements_ref_is_complete" CHECK (("stock_movements"."ref_table" is null) = ("stock_movements"."ref_id" is null))
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_ingredient_id_occurred_at_idx" ON "stock_movements" USING btree ("ingredient_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_location_id_type_occurred_at_idx" ON "stock_movements" USING btree ("location_id","type","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_ref_idx" ON "stock_movements" USING btree ("ref_table","ref_id");--> statement-breakpoint
CREATE POLICY "stock_movements_select_member" ON "stock_movements" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "stock_movements_insert_by_type" ON "stock_movements" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ((type in ('sale', 'count_adjust') and public.has_role(location_id, array['owner', 'manager']::public.member_role[])) or (type in ('delivery', 'waste') and public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[])));--> statement-breakpoint
-- Everything below is hand-written (Drizzle does not manage grants or triggers).

-- 1. The app role may read and append. No UPDATE, no DELETE, no TRUNCATE.
GRANT SELECT, INSERT ON public.stock_movements TO app_user;
--> statement-breakpoint

-- 2. Append-only, enforced in the database for every role, the admin connection included.
CREATE FUNCTION public.stock_movements_block_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements is append-only: % is not allowed. Correct a mistake with a new movement.', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
-- DELETE is allowed only while app.allow_movement_delete is 'on' for the current
-- transaction. undo_sales_import() sets it; nothing else in the app does. The app
-- role cannot delete in any case, because it has no DELETE privilege.
CREATE FUNCTION public.stock_movements_block_delete() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('app.allow_movement_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'stock_movements is append-only: rows are only removed by undo_sales_import().'
    USING ERRCODE = 'restrict_violation';
END
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_update
  BEFORE UPDATE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_block_change();
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_delete
  BEFORE DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_movements_block_delete();
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_truncate
  BEFORE TRUNCATE ON public.stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION public.stock_movements_block_change();
--> statement-breakpoint

-- 3. Supabase's Data API roles get nothing on our tables. New tables made by
--    migrations were given TRUNCATE, REFERENCES, TRIGGER and MAINTAIN by default;
--    take those away now and for tables created later (DECISIONS.md, entries 27 and 43).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
