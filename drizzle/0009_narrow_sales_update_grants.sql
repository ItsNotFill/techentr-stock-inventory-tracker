-- Custom migration (hand-written): the app role may only update the columns it
-- actually writes. A sale line's quantity, item or order, and an import's
-- status, must never change after the fact; undo_sales_import() (SECURITY
-- DEFINER) writes the undo columns itself. See DECISIONS.md, entry 67.
REVOKE UPDATE ON public.sale_lines FROM app_user;
--> statement-breakpoint
GRANT UPDATE (depleted_at) ON public.sale_lines TO app_user;
--> statement-breakpoint
REVOKE UPDATE ON public.sales_imports FROM app_user;
--> statement-breakpoint
GRANT UPDATE (row_count, skipped_count, unmapped_count) ON public.sales_imports TO app_user;
