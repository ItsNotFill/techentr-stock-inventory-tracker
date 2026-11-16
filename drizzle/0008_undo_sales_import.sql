-- Custom migration (hand-written).
--
-- undo_sales_import(): removes an import's sales, their lines and the stock
-- movements those lines wrote, in one transaction. It is the only path that
-- deletes from stock_movements (the delete trigger lets it through while
-- app.allow_movement_delete is 'on'). The sales_imports row stays, with status
-- 'undone', so the audit trail and the file name are kept and the same file can
-- be imported again. See DECISIONS.md, entries 12 and 59.
--
-- SECURITY DEFINER, because the app role cannot delete sales or movements.
-- The function checks the caller's role itself.
CREATE FUNCTION public.undo_sales_import(target_import uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  import_row public.sales_imports%ROWTYPE;
  removed_movements integer;
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

  PERFORM set_config('app.allow_movement_delete', 'on', true);

  DELETE FROM public.stock_movements m
  USING public.sale_lines sl
  JOIN public.sales s ON s.id = sl.sale_id AND s.location_id = sl.location_id
  WHERE s.import_id = import_row.id
    AND s.location_id = import_row.location_id
    AND m.location_id = import_row.location_id
    AND m.ref_table = 'sale_lines'
    AND m.ref_id = sl.id;
  GET DIAGNOSTICS removed_movements = ROW_COUNT;

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
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.undo_sales_import(uuid) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.undo_sales_import(uuid) TO app_user;
