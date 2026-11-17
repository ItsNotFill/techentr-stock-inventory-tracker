-- Custom migration (hand-written): hardening from the stage 4 review.
-- See DECISIONS.md, entry 72.

-- 1. Late corrections only for movements written in the CURRENT transaction.
--    lib/ledger calls this right after its own insert; created_at defaults to
--    now(), the transaction's start time. Passing the id of an older movement
--    (one that was on time) now does nothing, so nobody can forge a correction.
--    Import undo uses correct_for_late_movement directly and is unaffected.
CREATE OR REPLACE FUNCTION public.apply_late_corrections(movement_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m record;
  own_session uuid;
  corrected integer := 0;
  locked uuid[] := '{}';
BEGIN
  FOR m IN
    SELECT sm.id, sm.location_id, sm.ingredient_id, sm.occurred_at, sm.qty_delta, sm.ref_table, sm.ref_id
    FROM public.stock_movements sm
    WHERE sm.id = ANY (movement_ids)
      AND sm.created_at = now()
      AND sm.corrects_movement_id IS NULL
      AND public.is_member(sm.location_id)
    ORDER BY sm.occurred_at, sm.id
  LOOP
    IF NOT m.location_id = ANY (locked) THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || m.location_id::text, 0));
      locked := locked || m.location_id;
    END IF;
    IF EXISTS (SELECT 1 FROM public.stock_movements c WHERE c.corrects_movement_id = m.id) THEN
      CONTINUE;
    END IF;
    own_session := NULL;
    IF m.ref_table = 'count_lines' THEN
      SELECT cl.session_id INTO own_session FROM public.count_lines cl WHERE cl.id = m.ref_id;
    END IF;
    IF public.correct_for_late_movement(
         m.location_id, m.ingredient_id, m.occurred_at, m.qty_delta, m.id, own_session, public.current_user_id()) THEN
      corrected := corrected + 1;
    END IF;
  END LOOP;
  RETURN corrected;
END
$$;
--> statement-breakpoint

-- 2. No line can be added to an approved count, by anyone.
CREATE OR REPLACE FUNCTION public.count_lines_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  approved boolean;
  allowed boolean := coalesce(current_setting('app.allow_movement_delete', true), '') = 'on';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT s.status = 'approved' INTO approved
    FROM public.count_sessions s
    WHERE s.id = NEW.session_id AND s.location_id = NEW.location_id;
    IF coalesce(approved, false) THEN
      RAISE EXCEPTION 'A line cannot be added to an approved count.' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT s.status = 'approved' INTO approved
  FROM public.count_sessions s
  WHERE s.id = OLD.session_id AND s.location_id = OLD.location_id;
  IF coalesce(approved, false) AND NOT allowed THEN
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
DROP TRIGGER count_lines_freeze_approved ON public.count_lines;
--> statement-breakpoint
CREATE TRIGGER count_lines_freeze_approved
  BEFORE INSERT OR UPDATE OR DELETE ON public.count_lines
  FOR EACH ROW EXECUTE FUNCTION public.count_lines_guard();
