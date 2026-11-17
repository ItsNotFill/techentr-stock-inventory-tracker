-- Custom migration (hand-written): the late-movement rule (SCHEMA.md, "Ledger
-- rules"; DECISIONS.md 10, 68).
--
-- A movement dated at or before an approved count of the same ingredient, but
-- recorded after that count was approved, was not in the count's theoretical
-- stock. The count already reflects reality, so the movement must not change
-- stock after the count: the first such count gets an offsetting count_adjust
-- (dated at its own count time), and its late_adjust_qty takes the movement's
-- amount, so its unexplained usage reads as if everything had been entered on
-- time. Removing a movement (import undo) is the same rule with the opposite
-- amount.
--
-- The functions are SECURITY DEFINER because the person who records a late
-- delivery may be staff, who cannot write count adjustments themselves. They
-- check membership of the location.

-- Shared step. Not callable by the app; used by the two functions below.
CREATE FUNCTION public.correct_for_late_movement(
  loc uuid,
  ingredient uuid,
  happened_at timestamptz,
  delta numeric,
  source_movement uuid,
  skip_session uuid,
  actor uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_line uuid;
  target_time timestamptz;
BEGIN
  SELECT cl.id, cs.submitted_at INTO target_line, target_time
  FROM public.count_lines cl
  JOIN public.count_sessions cs ON cs.id = cl.session_id AND cs.location_id = cl.location_id
  WHERE cl.location_id = loc
    AND cl.ingredient_id = ingredient
    AND cs.status = 'approved'
    AND cs.submitted_at >= happened_at
    AND (skip_session IS NULL OR cs.id <> skip_session)
  ORDER BY cs.submitted_at, cs.id
  LIMIT 1
  FOR UPDATE OF cl;

  IF target_line IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.stock_movements
    (location_id, ingredient_id, qty_delta, type, ref_table, ref_id, note, occurred_at, created_by, corrects_movement_id)
  VALUES
    (loc, ingredient, -delta, 'count_adjust', 'count_lines', target_line,
     'Correction: a movement before this count was recorded after it was approved', target_time, actor, source_movement);

  UPDATE public.count_lines
  SET late_adjust_qty = late_adjust_qty + delta, updated_at = now()
  WHERE id = target_line;

  RETURN true;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.correct_for_late_movement(uuid, uuid, timestamptz, numeric, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, app_user;
--> statement-breakpoint

-- Called by lib/ledger right after it appends movements. Idempotent: a movement
-- that already has its correction is skipped.
CREATE FUNCTION public.apply_late_corrections(movement_ids uuid[]) RETURNS integer
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
      AND sm.corrects_movement_id IS NULL
      AND public.is_member(sm.location_id)
    ORDER BY sm.occurred_at, sm.id
  LOOP
    IF NOT m.location_id = ANY (locked) THEN
      -- Serialises with count approval in the same restaurant (lib/counts).
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
REVOKE ALL ON FUNCTION public.apply_late_corrections(uuid[]) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.apply_late_corrections(uuid[]) TO app_user;
--> statement-breakpoint

-- Import undo, now keeping approved counts right: each removed sale movement is
-- treated as a late movement of the opposite amount.
CREATE OR REPLACE FUNCTION public.undo_sales_import(target_import uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  import_row public.sales_imports%ROWTYPE;
  removed record;
  removed_movements integer := 0;
  removed_sales integer;
BEGIN
  SELECT * INTO import_row FROM public.sales_imports WHERE id = target_import FOR UPDATE;

  -- The same answer for "does not exist" and "not yours": nothing is revealed.
  IF NOT FOUND
     OR NOT public.has_role(import_row.location_id, ARRAY['owner', 'manager']::public.member_role[]) THEN
    RAISE EXCEPTION 'IMPORT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF import_row.status <> 'confirmed' THEN
    RAISE EXCEPTION 'IMPORT_NOT_CONFIRMED' USING ERRCODE = 'P0003';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || import_row.location_id::text, 0));
  PERFORM set_config('app.allow_movement_delete', 'on', true);

  FOR removed IN
    DELETE FROM public.stock_movements m
    USING public.sale_lines sl
    JOIN public.sales s ON s.id = sl.sale_id AND s.location_id = sl.location_id
    WHERE s.import_id = import_row.id
      AND s.location_id = import_row.location_id
      AND m.location_id = import_row.location_id
      AND m.ref_table = 'sale_lines'
      AND m.ref_id = sl.id
    RETURNING m.id, m.ingredient_id, m.occurred_at, m.qty_delta
  LOOP
    removed_movements := removed_movements + 1;
    PERFORM public.correct_for_late_movement(
      import_row.location_id, removed.ingredient_id, removed.occurred_at, -removed.qty_delta,
      removed.id, NULL, public.current_user_id());
  END LOOP;

  PERFORM set_config('app.allow_movement_delete', 'off', true);

  -- sale_lines go with their sales (ON DELETE CASCADE).
  DELETE FROM public.sales s
  WHERE s.import_id = import_row.id
    AND s.location_id = import_row.location_id;
  GET DIAGNOSTICS removed_sales = ROW_COUNT;

  UPDATE public.sales_imports
  SET status = 'undone',
      undone_by = public.current_user_id(),
      undone_at = now()
  WHERE id = import_row.id;

  RETURN jsonb_build_object('sales', removed_sales, 'movements', removed_movements);
END
$$;
