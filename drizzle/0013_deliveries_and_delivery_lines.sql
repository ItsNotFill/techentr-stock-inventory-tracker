CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"client_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"source" "delivery_source" NOT NULL,
	"status" "delivery_status" NOT NULL,
	"supplier_name" text,
	"invoice_number" text,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"photo_path" text,
	"ai_extraction_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "deliveries_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "deliveries_location_id_client_id_key" UNIQUE("location_id","client_id"),
	CONSTRAINT "deliveries_invoice_has_photo" CHECK ("deliveries"."source" <> 'invoice_photo' or "deliveries"."photo_path" is not null),
	CONSTRAINT "deliveries_confirmed_has_time" CHECK ("deliveries"."status" <> 'confirmed' or "deliveries"."confirmed_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delivery_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"ingredient_id" uuid,
	"pack_size_id" uuid,
	"pack_count" numeric(14, 3),
	"qty_base_unit" numeric(14, 3),
	"line_total" numeric(12, 2),
	"unit_cost" numeric(12, 6),
	"update_cost" boolean DEFAULT false NOT NULL,
	"raw_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_lines_pack_count_positive" CHECK ("delivery_lines"."pack_count" is null or "delivery_lines"."pack_count" > 0),
	CONSTRAINT "delivery_lines_qty_positive" CHECK ("delivery_lines"."qty_base_unit" is null or "delivery_lines"."qty_base_unit" > 0),
	CONSTRAINT "delivery_lines_line_total_not_negative" CHECK ("delivery_lines"."line_total" is null or "delivery_lines"."line_total" >= 0),
	CONSTRAINT "delivery_lines_unit_cost_not_negative" CHECK ("delivery_lines"."unit_cost" is null or "delivery_lines"."unit_cost" >= 0),
	CONSTRAINT "delivery_lines_pack_has_ingredient" CHECK ("delivery_lines"."pack_size_id" is null or "delivery_lines"."ingredient_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "delivery_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_delivery_fk" FOREIGN KEY ("delivery_id","location_id") REFERENCES "public"."deliveries"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_pack_size_fk" FOREIGN KEY ("pack_size_id","location_id") REFERENCES "public"."pack_sizes"("id","location_id") ON DELETE SET NULL ("pack_size_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_location_id_delivered_at_idx" ON "deliveries" USING btree ("location_id","delivered_at");--> statement-breakpoint
CREATE INDEX "deliveries_location_id_supplier_invoice_idx" ON "deliveries" USING btree ("location_id","supplier_name","invoice_number");--> statement-breakpoint
CREATE INDEX "delivery_lines_delivery_id_idx" ON "delivery_lines" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_lines_ingredient_id_idx" ON "delivery_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE POLICY "deliveries_select_member" ON "deliveries" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "deliveries_insert_own_draft" ON "deliveries" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "deliveries"."created_by" = public.current_user_id() and "deliveries"."status" = 'draft' and "deliveries"."confirmed_by" is null and "deliveries"."confirmed_at" is null);--> statement-breakpoint
CREATE POLICY "deliveries_update_own_draft" ON "deliveries" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "deliveries"."created_by" = public.current_user_id() and "deliveries"."status" = 'draft') WITH CHECK ("deliveries"."created_by" = public.current_user_id() and ("deliveries"."status" in ('draft', 'discarded') or ("deliveries"."status" = 'confirmed' and "deliveries"."source" = 'manual' and "deliveries"."confirmed_by" = public.current_user_id())));--> statement-breakpoint
CREATE POLICY "deliveries_update_manager" ON "deliveries" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and "deliveries"."status" = 'draft') WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "deliveries_delete_unconfirmed" ON "deliveries" AS PERMISSIVE FOR DELETE TO "app_user" USING ("deliveries"."status" in ('draft', 'discarded') and ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "deliveries"."created_by" = public.current_user_id()) or public.has_role(location_id, array['owner', 'manager']::public.member_role[])));--> statement-breakpoint
CREATE POLICY "delivery_lines_select_member" ON "delivery_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "delivery_lines_insert_draft" ON "delivery_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.deliveries d where d.id = "delivery_lines"."delivery_id" and d.location_id = "delivery_lines"."location_id" and d.status = 'draft' and (d.created_by = public.current_user_id() or public.has_role(d.location_id, array['owner', 'manager']::public.member_role[]))));--> statement-breakpoint
CREATE POLICY "delivery_lines_update_draft" ON "delivery_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.deliveries d where d.id = "delivery_lines"."delivery_id" and d.location_id = "delivery_lines"."location_id" and d.status = 'draft' and (d.created_by = public.current_user_id() or public.has_role(d.location_id, array['owner', 'manager']::public.member_role[])))) WITH CHECK (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.deliveries d where d.id = "delivery_lines"."delivery_id" and d.location_id = "delivery_lines"."location_id" and d.status = 'draft' and (d.created_by = public.current_user_id() or public.has_role(d.location_id, array['owner', 'manager']::public.member_role[]))));--> statement-breakpoint
CREATE POLICY "delivery_lines_delete_draft" ON "delivery_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.deliveries d where d.id = "delivery_lines"."delivery_id" and d.location_id = "delivery_lines"."location_id" and d.status = 'draft' and (d.created_by = public.current_user_id() or public.has_role(d.location_id, array['owner', 'manager']::public.member_role[]))));--> statement-breakpoint
-- Hand-written: privileges and guards (Drizzle does not manage grants or triggers).
-- The pack size key above was also edited by hand to ON DELETE SET NULL
-- ("pack_size_id"): a plain SET NULL would null location_id too (SCHEMA.md).

-- 1. The app role may update only the columns the app writes.
GRANT SELECT, INSERT, DELETE ON public.deliveries TO app_user;--> statement-breakpoint
GRANT UPDATE (status, supplier_name, invoice_number, delivered_at, confirmed_by, confirmed_at) ON public.deliveries TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.delivery_lines TO app_user;--> statement-breakpoint
GRANT UPDATE (ingredient_id, pack_size_id, pack_count, qty_base_unit, line_total, unit_cost, update_cost, raw_text) ON public.delivery_lines TO app_user;--> statement-breakpoint

-- 2. A confirmed delivery is history: its movements point at its lines. It
--    cannot be changed or deleted, by any role. Confirming needs at least one
--    line, and every line needs an ingredient and a quantity. Removing a whole
--    throwaway test restaurant uses the ledger's switch (DECISIONS.md 59).
CREATE FUNCTION public.deliveries_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'confirmed' AND coalesce(current_setting('app.allow_movement_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'A confirmed delivery cannot be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'confirmed' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.delivery_lines l WHERE l.delivery_id = NEW.id AND l.location_id = NEW.location_id
    ) THEN
      RAISE EXCEPTION 'A delivery needs at least one line before it is confirmed.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.delivery_lines l
      WHERE l.delivery_id = NEW.id AND l.location_id = NEW.location_id
        AND (l.ingredient_id IS NULL OR l.qty_base_unit IS NULL)
    ) THEN
      RAISE EXCEPTION 'Every line of a confirmed delivery needs an ingredient and a quantity.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER deliveries_freeze_confirmed
  BEFORE UPDATE OR DELETE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deliveries_guard();
--> statement-breakpoint

-- 3. Lines change only while their delivery is a draft. The one exception:
--    deleting a pack size sets pack_size_id to null on old lines.
--    SECURITY DEFINER so it always sees the delivery and can lock it, whatever
--    the caller's policies allow (FOR SHARE waits for a confirmation in flight).
CREATE FUNCTION public.delivery_lines_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parent_status public.delivery_status;
BEGIN
  IF coalesce(current_setting('app.allow_movement_delete', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT d.status INTO parent_status FROM public.deliveries d
    WHERE d.id = NEW.delivery_id AND d.location_id = NEW.location_id
    FOR SHARE;
    IF parent_status = 'confirmed' THEN
      RAISE EXCEPTION 'A line cannot be added to a confirmed delivery.' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT d.status INTO parent_status FROM public.deliveries d
  WHERE d.id = OLD.delivery_id AND d.location_id = OLD.location_id
  FOR SHARE;
  IF parent_status = 'confirmed' THEN
    IF TG_OP = 'UPDATE'
       AND NEW.pack_size_id IS NULL
       AND (NEW.id, NEW.location_id, NEW.delivery_id, NEW.ingredient_id, NEW.pack_count, NEW.qty_base_unit,
            NEW.line_total, NEW.unit_cost, NEW.update_cost, NEW.raw_text, NEW.created_at)
           IS NOT DISTINCT FROM
           (OLD.id, OLD.location_id, OLD.delivery_id, OLD.ingredient_id, OLD.pack_count, OLD.qty_base_unit,
            OLD.line_total, OLD.unit_cost, OLD.update_cost, OLD.raw_text, OLD.created_at) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'A line of a confirmed delivery cannot be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delivery_lines_guard() FROM PUBLIC, anon, authenticated, app_user;
--> statement-breakpoint
CREATE TRIGGER delivery_lines_freeze_confirmed
  BEFORE INSERT OR UPDATE OR DELETE ON public.delivery_lines
  FOR EACH ROW EXECUTE FUNCTION public.delivery_lines_guard();
