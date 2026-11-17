CREATE TABLE "count_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"counted_qty" numeric(14, 3) NOT NULL,
	"theoretical_qty" numeric(14, 3),
	"late_adjust_qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(12, 6),
	"is_opening" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "count_lines_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "count_lines_session_id_ingredient_id_key" UNIQUE("session_id","ingredient_id"),
	CONSTRAINT "count_lines_counted_not_negative" CHECK ("count_lines"."counted_qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "count_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "count_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" "count_status" DEFAULT 'draft' NOT NULL,
	"counted_by" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "count_sessions_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "count_sessions_id_location_id_key" UNIQUE("id","location_id"),
	CONSTRAINT "count_sessions_submitted_has_time" CHECK ("count_sessions"."status" = 'draft' or "count_sessions"."submitted_at" is not null),
	CONSTRAINT "count_sessions_reviewed_has_reviewer" CHECK ("count_sessions"."status" not in ('approved', 'rejected') or "count_sessions"."approved_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "count_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "corrects_movement_id" uuid;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_session_fk" FOREIGN KEY ("session_id","location_id") REFERENCES "public"."count_sessions"("id","location_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_lines" ADD CONSTRAINT "count_lines_ingredient_fk" FOREIGN KEY ("ingredient_id","location_id") REFERENCES "public"."ingredients"("id","location_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_sessions" ADD CONSTRAINT "count_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_sessions" ADD CONSTRAINT "count_sessions_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "auth"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "count_sessions" ADD CONSTRAINT "count_sessions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "count_lines_ingredient_id_idx" ON "count_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "count_sessions_location_id_status_idx" ON "count_sessions" USING btree ("location_id","status");--> statement-breakpoint
CREATE INDEX "count_sessions_location_id_submitted_at_idx" ON "count_sessions" USING btree ("location_id","submitted_at");--> statement-breakpoint
CREATE INDEX "stock_movements_corrects_movement_id_idx" ON "stock_movements" USING btree ("corrects_movement_id");--> statement-breakpoint
CREATE POLICY "count_lines_select_member" ON "count_lines" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "count_lines_insert" ON "count_lines" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and s.status = 'draft' and s.counted_by = public.current_user_id())) or public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "count_lines_update" ON "count_lines" AS PERMISSIVE FOR UPDATE TO "app_user" USING ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and s.status = 'draft' and s.counted_by = public.current_user_id())) or public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and s.status = 'draft' and s.counted_by = public.current_user_id())) or public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "count_lines_delete" ON "count_lines" AS PERMISSIVE FOR DELETE TO "app_user" USING ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and s.status = 'draft' and s.counted_by = public.current_user_id())) or (public.has_role(location_id, array['owner', 'manager']::public.member_role[]) and exists (select 1 from public.count_sessions s where s.id = "count_lines"."session_id" and s.location_id = "count_lines"."location_id" and s.status <> 'approved')));--> statement-breakpoint
CREATE POLICY "count_sessions_select_member" ON "count_sessions" AS PERMISSIVE FOR SELECT TO "app_user" USING (public.is_member(location_id));--> statement-breakpoint
CREATE POLICY "count_sessions_insert_own" ON "count_sessions" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "count_sessions"."counted_by" = public.current_user_id() and "count_sessions"."status" in ('draft', 'submitted') and "count_sessions"."approved_by" is null);--> statement-breakpoint
CREATE POLICY "count_sessions_update_own_draft" ON "count_sessions" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "count_sessions"."counted_by" = public.current_user_id() and "count_sessions"."status" = 'draft') WITH CHECK ("count_sessions"."counted_by" = public.current_user_id() and "count_sessions"."status" in ('draft', 'submitted') and "count_sessions"."approved_by" is null);--> statement-breakpoint
CREATE POLICY "count_sessions_update_manager" ON "count_sessions" AS PERMISSIVE FOR UPDATE TO "app_user" USING (public.has_role(location_id, array['owner', 'manager']::public.member_role[])) WITH CHECK (public.has_role(location_id, array['owner', 'manager']::public.member_role[]));--> statement-breakpoint
CREATE POLICY "count_sessions_delete_draft" ON "count_sessions" AS PERMISSIVE FOR DELETE TO "app_user" USING ("count_sessions"."status" = 'draft' and ((public.has_role(location_id, array['owner', 'manager', 'staff']::public.member_role[]) and "count_sessions"."counted_by" = public.current_user_id()) or public.has_role(location_id, array['owner', 'manager']::public.member_role[])));--> statement-breakpoint
-- Hand-written: privileges and guards.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.count_sessions TO app_user;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON public.count_lines TO app_user;--> statement-breakpoint
-- late_adjust_qty is written only by the correction function (SECURITY DEFINER).
GRANT UPDATE (counted_qty, theoretical_qty, unit_cost, is_opening, updated_at) ON public.count_lines TO app_user;--> statement-breakpoint

-- An approved count is history: it cannot be changed or deleted. The only
-- exception is late_adjust_qty, kept up to date by the late-movement rule.
-- Removing a whole throwaway test restaurant uses the same switch as the
-- ledger's delete trigger (DECISIONS.md 59).
CREATE FUNCTION public.count_sessions_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'approved' AND coalesce(current_setting('app.allow_movement_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'An approved count cannot be changed.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER count_sessions_freeze_approved
  BEFORE UPDATE OR DELETE ON public.count_sessions
  FOR EACH ROW EXECUTE FUNCTION public.count_sessions_guard();
--> statement-breakpoint
CREATE FUNCTION public.count_lines_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  approved boolean;
BEGIN
  SELECT s.status = 'approved' INTO approved
  FROM public.count_sessions s
  WHERE s.id = OLD.session_id AND s.location_id = OLD.location_id;
  IF coalesce(approved, false) AND coalesce(current_setting('app.allow_movement_delete', true), '') <> 'on' THEN
    IF TG_OP = 'DELETE'
       OR NEW.counted_qty IS DISTINCT FROM OLD.counted_qty
       OR NEW.theoretical_qty IS DISTINCT FROM OLD.theoretical_qty
       OR NEW.unit_cost IS DISTINCT FROM OLD.unit_cost
       OR NEW.is_opening IS DISTINCT FROM OLD.is_opening
       OR NEW.ingredient_id IS DISTINCT FROM OLD.ingredient_id
       OR NEW.session_id IS DISTINCT FROM OLD.session_id THEN
      RAISE EXCEPTION 'A line of an approved count cannot be changed.' USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER count_lines_freeze_approved
  BEFORE UPDATE OR DELETE ON public.count_lines
  FOR EACH ROW EXECUTE FUNCTION public.count_lines_guard();
