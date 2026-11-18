import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import type { MovementType, WasteReason } from "@/lib/db/schema";

/**
 * Stock history: every movement of one ingredient, newest first, with the
 * stock after each one. Read-only, through the RLS client.
 */

export type HistoryFilter = {
  /** Only these types; all when empty or missing. */
  types?: MovementType[];
  /** Movements that happened at or after this moment. */
  from?: Date;
  /** Movements that happened before this moment. */
  before?: Date;
  /** At most this many rows (default 500). */
  limit?: number;
};

export type HistorySource =
  | { kind: "sale"; posOrderId: string; menuItemName: string; importId: string; fileName: string | null }
  | { kind: "delivery"; deliveryId: string; supplierName: string | null }
  | { kind: "count"; sessionId: string; isOpening: boolean }
  | null;

export type HistoryRow = {
  id: string;
  type: MovementType;
  /** Base units. Positive adds stock. */
  qtyDelta: string;
  /** Stock right after this movement, counting every movement of the ingredient, not only the filtered ones. */
  stockAfter: string;
  occurredAt: Date;
  /** When it was recorded; later than `occurredAt` for a late movement. */
  createdAt: Date;
  note: string | null;
  wasteReason: WasteReason | null;
  /** A late-movement correction of an approved count (DECISIONS.md 68). */
  isCorrection: boolean;
  createdBy: string | null;
  /** Known to owners and managers; null for staff. */
  createdByEmail: string | null;
  source: HistorySource;
};

export type IngredientHistory = {
  rows: HistoryRow[];
  /** More movements match than were returned: narrow the dates. */
  truncated: boolean;
  /** Sum of qty_delta per type over every movement that matches (not only the rows returned). */
  totals: Partial<Record<MovementType, string>>;
};

export const HISTORY_LIMIT = 500;

export async function getIngredientHistory(
  tx: Tx,
  locationId: string,
  ingredientId: string,
  filter: HistoryFilter = {},
): Promise<IngredientHistory> {
  const limit = Math.min(Math.max(filter.limit ?? HISTORY_LIMIT, 1), HISTORY_LIMIT);
  const conditions: SQL[] = [sql`true`];
  if (filter.types && filter.types.length > 0) {
    conditions.push(sql`o.type in (${sql.join(filter.types.map((type) => sql`${type}::public.movement_type`), sql`, `)})`);
  }
  if (filter.from) conditions.push(sql`o.occurred_at >= ${filter.from.toISOString()}::timestamptz`);
  if (filter.before) conditions.push(sql`o.occurred_at < ${filter.before.toISOString()}::timestamptz`);
  const where = sql.join(conditions, sql` and `);

  // Running stock over the whole ledger of the ingredient, in the order stock
  // is computed (occurred_at), recorded order breaking ties.
  const ordered = sql`
    select sm.*, sum(sm.qty_delta) over (
             order by sm.occurred_at, sm.created_at, sm.id
             rows between unbounded preceding and current row
           ) as stock_after
    from public.stock_movements sm
    where sm.location_id = ${locationId}::uuid and sm.ingredient_id = ${ingredientId}::uuid
  `;

  const rows = await tx.execute<{
    id: string;
    type: MovementType;
    qty_delta: string;
    stock_after: string;
    occurred_at: string;
    created_at: string;
    note: string | null;
    waste_reason: WasteReason | null;
    corrects_movement_id: string | null;
    created_by: string | null;
    created_by_email: string | null;
    pos_order_id: string | null;
    menu_item_name: string | null;
    import_id: string | null;
    file_name: string | null;
    delivery_id: string | null;
    supplier_name: string | null;
    session_id: string | null;
    is_opening: boolean | null;
  }>(sql`
    with o as (${ordered})
    select o.id, o.type, o.qty_delta::text as qty_delta, o.stock_after::numeric(14, 3)::text as stock_after,
           o.occurred_at, o.created_at, o.note, o.waste_reason, o.corrects_movement_id, o.created_by,
           m.email as created_by_email,
           s.pos_order_id, mi.display_name as menu_item_name, s.import_id, si.file_name,
           dl.delivery_id, d.supplier_name,
           cl.session_id, cl.is_opening
    from o
    left join public.sale_lines sl on o.ref_table = 'sale_lines' and sl.id = o.ref_id and sl.location_id = o.location_id
    left join public.sales s on s.id = sl.sale_id and s.location_id = o.location_id
    left join public.sales_imports si on si.id = s.import_id and si.location_id = o.location_id
    left join public.menu_items mi on mi.id = sl.menu_item_id and mi.location_id = o.location_id
    left join public.delivery_lines dl on o.ref_table = 'delivery_lines' and dl.id = o.ref_id and dl.location_id = o.location_id
    left join public.deliveries d on d.id = dl.delivery_id and d.location_id = o.location_id
    left join public.count_lines cl on o.ref_table = 'count_lines' and cl.id = o.ref_id and cl.location_id = o.location_id
    left join public.list_location_members(${locationId}::uuid) m on m.user_id = o.created_by
    where ${where}
    order by o.occurred_at desc, o.created_at desc, o.id desc
    limit ${limit + 1}
  `);

  const totals = await tx.execute<{ type: MovementType; total: string }>(sql`
    with o as (${ordered})
    select o.type, sum(o.qty_delta)::numeric(14, 3)::text as total
    from o
    where ${where}
    group by o.type
  `);

  const sourceOf = (row: (typeof rows)[number]): HistorySource => {
    if (row.type === "sale" && row.pos_order_id && row.import_id) {
      return { kind: "sale", posOrderId: row.pos_order_id, menuItemName: row.menu_item_name ?? "", importId: row.import_id, fileName: row.file_name };
    }
    if (row.type === "delivery" && row.delivery_id) {
      return { kind: "delivery", deliveryId: row.delivery_id, supplierName: row.supplier_name };
    }
    if (row.type === "count_adjust" && row.session_id) {
      return { kind: "count", sessionId: row.session_id, isOpening: row.is_opening ?? false };
    }
    return null;
  };

  return {
    rows: rows.slice(0, limit).map((row) => ({
      id: row.id,
      type: row.type,
      qtyDelta: row.qty_delta,
      stockAfter: row.stock_after,
      occurredAt: new Date(row.occurred_at),
      createdAt: new Date(row.created_at),
      note: row.note,
      wasteReason: row.waste_reason,
      isCorrection: row.corrects_movement_id !== null,
      createdBy: row.created_by,
      createdByEmail: row.created_by_email,
      source: sourceOf(row),
    })),
    truncated: rows.length > limit,
    totals: Object.fromEntries(totals.map((row) => [row.type, row.total])),
  };
}
