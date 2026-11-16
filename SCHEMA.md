# SCHEMA.md: Drizzle schema plan

This is the plan for `lib/db/schema/`. It is not code yet. Build each table in the stage named in its heading, through a Drizzle migration. Where this plan and `SPEC.md` differ, the reason is in `DECISIONS.md`.

Seventeen tables: the fourteen in SPEC.md plus `deliveries`, `delivery_lines` and `ai_extractions`.

## Conventions

| Thing | Rule |
| --- | --- |
| Primary keys | `uuid("id").primaryKey().defaultRandom()` unless stated |
| Timestamps | `timestamp({ withTimezone: true })`, stored in UTC; shown in the location's timezone |
| Quantities | `numeric({ precision: 14, scale: 3 })` in base units. Called **qty** below |
| Cost per base unit | `numeric({ precision: 12, scale: 6 })`. Called **unit cost** below (€8 per kg = 0.008000 per g) |
| Money | `numeric({ precision: 12, scale: 2 })`, euros. Called **money** below |
| Users | `uuid` referencing `auth.users.id` (Supabase Auth). There is no users table of our own |
| Tenant column | `location_id uuid not null` references `locations.id`, on every table except `organizations` and `locations` |
| Numbers in TypeScript | Drizzle returns `numeric` as a string. Parse with `decimal.js` or do the maths in SQL. Never `Number()` |
| RLS | Enabled on every table, with policies declared in the Drizzle schema |

Check the exact Drizzle names for RLS (`pgPolicy`, `enableRLS`, the `drizzle-orm/supabase` helpers) against the current Drizzle docs in stage 0. They are the part of this plan most likely to have changed.

## Enums

| Enum | Values |
| --- | --- |
| `member_role` | `owner`, `manager`, `staff` |
| `base_unit` | `g`, `ml`, `unit` |
| `menu_item_kind` | `item`, `modifier` |
| `recipe_line_source` | `manual`, `ai` |
| `movement_type` | `sale`, `delivery`, `waste`, `count_adjust` |
| `waste_reason` | `expired`, `dropped`, `burnt`, `other` |
| `import_source` | `csv`, `photo` |
| `import_status` | `draft`, `confirmed`, `undone` |
| `count_status` | `draft`, `submitted`, `approved`, `rejected` |
| `delivery_source` | `manual`, `invoice_photo` |
| `delivery_status` | `draft`, `confirmed`, `discarded` |
| `ai_extraction_kind` | `menu_screenshot`, `recipe_draft`, `eod_report`, `supplier_invoice` |
| `ai_extraction_status` | `draft`, `confirmed`, `discarded`, `failed` |

## Row Level Security

Two SQL helper functions, `SECURITY DEFINER` and `STABLE`, created in a custom migration in stage 1. They read `memberships` for `auth.uid()`; being definer functions, they avoid a policy on `memberships` calling itself.

| Function | Returns true when |
| --- | --- |
| `is_member(loc uuid)` | the signed-in user has any membership for that location |
| `has_role(loc uuid, roles member_role[])` | the signed-in user's role for that location is in the list |

Policy shape used by every tenant table:

- **Select:** `is_member(location_id)`.
- **Insert, update, delete:** `has_role(location_id, <roles>)`, with the roles from the table below.
- No policy for an operation means it is denied.

| Table | Who may write |
| --- | --- |
| `organizations`, `locations` | update: owner. Insert only by the sign-up bootstrap (admin connection) |
| `memberships` | owner |
| `ingredients`, `pack_sizes` | owner, manager |
| `menu_items`, `recipe_lines` | owner, manager |
| `pos_import_mappings`, `sales_imports`, `sales`, `sale_lines` | owner, manager |
| `stock_movements` | insert only. `sale` and `count_adjust`: owner, manager. `delivery` and `waste`: any member |
| `count_sessions`, `count_lines` | any member creates and edits their own draft; owner, manager approve or reject |
| `deliveries`, `delivery_lines` | any member creates; confirming an `invoice_photo` delivery: owner, manager |
| `ai_extractions` | any member inserts; owner, manager confirm (staff uploads are confirmed through the delivery or import they belong to) |

The Supabase Storage bucket `photos` is private. Paths are `{location_id}/{kind}/{uuid}.jpg`, and the bucket policy allows access only when `is_member()` is true for the first path segment.

## Tables

### Tenancy (stage 1)

#### `organizations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `name` | text, not null | |
| `plan` | text, not null, default `'pilot'` | |
| `created_at` | timestamptz, default now | |

Select policy: the user is a member of at least one location in the organization.

#### `locations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `org_id` | uuid, not null, FK `organizations.id` | |
| `name` | text, not null | |
| `pos_provider` | text, nullable | free text for now, e.g. `lightspeed` |
| `timezone` | text, not null | IANA name, taken from the browser at sign-up |
| `created_at` | timestamptz, default now | |

Index: `(org_id)`.

#### `memberships`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid, not null, FK `auth.users.id` on delete cascade | |
| `location_id` | uuid, not null, FK `locations.id` on delete cascade | |
| `role` | `member_role`, not null | |
| `created_at` | timestamptz, default now | |

Primary key: `(user_id, location_id)`. Index: `(location_id)`. The app refuses to remove or demote the last owner of a location.

### Catalogue (stages 1 and 2)

#### `ingredients` (stage 1)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `name` | text, not null | |
| `base_unit` | `base_unit`, not null | cannot change once the ingredient has movements (app check) |
| `cost_per_base_unit` | unit cost, not null, default 0 | updated by confirmed invoices |
| `par_level` | qty, nullable | |
| `reorder_point` | qty, nullable | drives the low-stock list |
| `category` | text, nullable | e.g. dairy, spirits |
| `storage_area` | text, nullable | e.g. walk-in fridge; the count screen groups by it |
| `is_active` | boolean, not null, default true | archive instead of delete, because movements reference it |
| `created_at`, `updated_at` | timestamptz | |

Unique index: `(location_id, lower(name))`. Index: `(location_id, storage_area)`. There is no stock column; see "Ledger rules".

#### `pack_sizes` (stage 1)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `ingredient_id` | uuid, not null, FK `ingredients.id` on delete cascade | |
| `label` | text, not null | e.g. "Case 12×1 L" |
| `qty_in_base_unit` | qty, not null, check `> 0` | e.g. 12000 |
| `is_default` | boolean, not null, default false | preselected on delivery and count screens |
| `created_at` | timestamptz | |

Unique: `(ingredient_id, label)`.

#### `menu_items` (stage 2)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `pos_item_id` | text, nullable | the POS's own ID, when the export has one |
| `pos_name` | text, not null | the name exactly as the POS prints it |
| `display_name` | text, not null | |
| `kind` | `menu_item_kind`, not null, default `item` | modifiers ("extra cheese") are items with their own recipe |
| `category` | text, nullable | |
| `price` | money, nullable | read by AI when visible; not used in stock maths |
| `is_mapped` | boolean, not null, default false | true only when the item has a confirmed recipe |
| `is_ignored` | boolean, not null, default false | uses no stock (service charge); leaves the unmapped queue |
| `ai_extraction_id` | uuid, nullable, FK `ai_extractions.id` | set when the item came from a menu screenshot |
| `created_at`, `updated_at` | timestamptz | |

Unique indexes: `(location_id, pos_item_id)` where `pos_item_id is not null`; `(location_id, lower(pos_name))` where `pos_item_id is null`. Sales rows match on `pos_item_id` first, then on the normalised name.

Unmapped queue = `is_mapped = false and is_ignored = false`. Items seen in sales but unknown to the app are created here automatically, unmapped.

#### `recipe_lines` (stage 2)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `menu_item_id` | uuid, not null, FK `menu_items.id` on delete cascade | |
| `ingredient_id` | uuid, nullable, FK `ingredients.id` on delete restrict | null only on an AI draft whose ingredient does not exist yet |
| `draft_ingredient_name` | text, nullable | what the AI called the ingredient |
| `draft_base_unit` | `base_unit`, nullable | the unit the AI proposed |
| `qty_base_unit` | qty, not null, check `> 0` | amount used by one sale of the item |
| `source` | `recipe_line_source`, not null, default `manual` | **AI flag:** who proposed the line |
| `confirmed_at` | timestamptz, nullable | **AI flag:** null means draft. Manual lines are confirmed on save |
| `confirmed_by` | uuid, nullable | |
| `created_at`, `updated_at` | timestamptz | |

Unique: `(menu_item_id, ingredient_id)`. Check: `confirmed_at is null or ingredient_id is not null`.

Only lines with `confirmed_at` set are used for depletion. Confirming a recipe creates or matches the ingredients named in its drafts, sets `ingredient_id`, and sets `menu_items.is_mapped = true`.

### AI reads (stage 2)

#### `ai_extractions`

One row per call to the vision model. This is the audit trail for every AI read and the home of drafts that are not yet rows elsewhere (the menu list before the owner confirms it).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `kind` | `ai_extraction_kind`, not null | |
| `status` | `ai_extraction_status`, not null, default `draft` | **AI flag** |
| `photo_paths` | text array, not null, default empty | Storage paths; several for menu screenshots, empty for `recipe_draft` |
| `model` | text, not null | the model ID used |
| `result` | jsonb, nullable | the Zod-validated output |
| `error` | text, nullable | set when `status = failed` |
| `input_tokens`, `output_tokens` | integer, nullable | for cost tracking |
| `created_by` | uuid, not null | |
| `created_at` | timestamptz | |
| `confirmed_by`, `confirmed_at` | uuid, timestamptz, nullable | |

Index: `(location_id, kind, created_at)`.

### Sales (stage 3)

#### `pos_import_mappings`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `pos_provider` | text, not null | |
| `column_map` | jsonb, not null | Zod-typed: which CSV column is order ID, item name, item ID, quantity, sold-at; plus date format, delimiter, decimal separator |
| `updated_by` | uuid | |
| `updated_at` | timestamptz | |

Unique: `(location_id, pos_provider)`.

#### `sales_imports`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `source` | `import_source`, not null | `csv` or `photo` |
| `status` | `import_status`, not null | **AI flag.** CSV imports are created `confirmed` (the preview happens before saving). Photo imports are created `draft` and confirmed on the confirmation screen |
| `file_name` | text, nullable | CSV |
| `photo_path` | text, nullable | **AI field:** Storage path of the report photo |
| `ai_extraction_id` | uuid, nullable, FK `ai_extractions.id` | **AI field:** the raw reading |
| `business_date` | date, nullable | the trading day a photo report covers |
| `imported_by` | uuid, not null | |
| `row_count` | integer, not null, default 0 | |
| `skipped_count` | integer, not null, default 0 | orders skipped as already imported |
| `unmapped_count` | integer, not null, default 0 | lines waiting in the unmapped queue |
| `created_at` | timestamptz | |
| `confirmed_by`, `confirmed_at` | uuid, timestamptz, nullable | |
| `undone_by`, `undone_at` | uuid, timestamptz, nullable | |

Check: `source <> 'photo' or (photo_path is not null and business_date is not null)`. Index: `(location_id, created_at)`.

#### `sales`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `import_id` | uuid, not null, FK `sales_imports.id` on delete cascade | |
| `pos_order_id` | text, not null | photo imports use `eod:<business_date>` |
| `sold_at` | timestamptz, not null | photo imports use the end of the business date in the location's timezone |
| `created_at` | timestamptz | |

**Unique: `(location_id, pos_order_id)`.** This is the idempotency rule. Indexes: `(location_id, sold_at)`, `(import_id)`.

#### `sale_lines`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `sale_id` | uuid, not null, FK `sales.id` on delete cascade | |
| `menu_item_id` | uuid, not null, FK `menu_items.id` on delete restrict | |
| `qty` | qty, not null, check `<> 0` | negative for a refund |
| `depleted_at` | timestamptz, nullable | null until its movements are written |

Indexes: `(sale_id)`; `(menu_item_id)` where `depleted_at is null`, which is the back-fill queue: when an unmapped item gets a confirmed recipe, these lines are depleted.

### Ledger (stage 3)

#### `stock_movements`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `ingredient_id` | uuid, not null, FK `ingredients.id` on delete restrict | |
| `qty_delta` | qty, not null, check `<> 0` | positive adds stock, negative removes it |
| `type` | `movement_type`, not null | |
| `ref_table` | text, nullable | see the reference table below |
| `ref_id` | uuid, nullable | no foreign key, because it points at different tables |
| `waste_reason` | `waste_reason`, nullable | check: required when `type = 'waste'` |
| `note` | text, nullable | |
| `occurred_at` | timestamptz, not null, default now | when it happened |
| `created_by` | uuid, nullable | |
| `created_at` | timestamptz, not null, default now | when it was recorded |

Indexes: `(ingredient_id, occurred_at)`, `(location_id, type, occurred_at)`, `(ref_table, ref_id)`.

| `type` | `ref_table` | `occurred_at` |
| --- | --- | --- |
| `sale` | `sale_lines` | the sale's `sold_at` |
| `delivery` | `delivery_lines` | the delivery's `delivered_at` |
| `waste` | null | when it was logged |
| `count_adjust` | `count_lines` | the session's `submitted_at` |

Append-only is enforced in the database, not only in code:

- RLS has select and insert policies only. `UPDATE` and `DELETE` are revoked from the `authenticated` and `anon` roles.
- A `BEFORE UPDATE` trigger always raises an error.
- A `BEFORE DELETE` trigger raises an error unless it runs inside `undo_sales_import()`.

### Counts (stage 4)

#### `count_sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `client_id` | uuid, not null, unique | generated on the phone; a count saved offline and synced twice stays one session |
| `status` | `count_status`, not null, default `draft` | |
| `counted_by` | uuid, not null | |
| `started_at` | timestamptz, not null | |
| `submitted_at` | timestamptz, nullable | the count time. For an offline count, the time on the phone, never later than the sync time |
| `approved_by`, `approved_at` | uuid, timestamptz, nullable | also used for a rejection |
| `review_note` | text, nullable | |
| `created_at` | timestamptz | |

Indexes: `(location_id, status)`, `(location_id, submitted_at)`. A session may cover only some ingredients; only counted ingredients are adjusted.

#### `count_lines`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `session_id` | uuid, not null, FK `count_sessions.id` on delete cascade | |
| `ingredient_id` | uuid, not null, FK `ingredients.id` on delete restrict | |
| `counted_qty` | qty, not null, check `>= 0` | |
| `theoretical_qty` | qty, nullable | ledger stock as of `submitted_at`; provisional at submit, fixed at approval |
| `late_adjust_qty` | qty, not null, default 0 | sum of movements dated before this count but recorded after its approval |
| `unit_cost` | unit cost, nullable | snapshot of the ingredient's cost at approval |
| `is_opening` | boolean, not null, default false | first count of this ingredient; left out of unexplained-usage totals |
| `created_at`, `updated_at` | timestamptz | |

Unique: `(session_id, ingredient_id)`.

Unexplained usage for a line = `counted_qty − (theoretical_qty + late_adjust_qty)`, and in euros that figure × `unit_cost`. It always equals the sum of the `count_adjust` movements that reference the line; a test must assert this.

### Deliveries (stage 5)

#### `deliveries`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `source` | `delivery_source`, not null | `manual` or `invoice_photo` |
| `status` | `delivery_status`, not null | **AI flag.** Manual deliveries are created `confirmed`. Invoice photos are created `draft` |
| `supplier_name` | text, nullable | |
| `invoice_number` | text, nullable | |
| `delivered_at` | timestamptz, not null, default now | |
| `photo_path` | text, nullable | **AI field:** Storage path of the invoice photo |
| `ai_extraction_id` | uuid, nullable, FK `ai_extractions.id` | **AI field:** the raw reading |
| `created_by` | uuid, not null | |
| `created_at` | timestamptz | |
| `confirmed_by`, `confirmed_at` | uuid, timestamptz, nullable | |

Check: `source <> 'invoice_photo' or photo_path is not null`. Indexes: `(location_id, delivered_at)`; `(location_id, supplier_name, invoice_number)`, not unique, used to warn about an invoice entered twice.

#### `delivery_lines`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `location_id` | uuid, not null | |
| `delivery_id` | uuid, not null, FK `deliveries.id` on delete cascade | |
| `ingredient_id` | uuid, nullable, FK `ingredients.id` on delete restrict | null only while a draft invoice line is unmatched |
| `pack_size_id` | uuid, nullable, FK `pack_sizes.id` on delete set null | |
| `pack_count` | qty, nullable | e.g. 2 cases |
| `qty_base_unit` | qty, nullable | required and `> 0` at confirmation |
| `line_total` | money, nullable | from the invoice |
| `unit_cost` | unit cost, nullable | `line_total / qty_base_unit` |
| `update_cost` | boolean, not null, default false | when true, confirming sets the ingredient's `cost_per_base_unit` |
| `raw_text` | text, nullable | the line as read from the invoice |
| `created_at` | timestamptz | |

Index: `(delivery_id)`. On confirmation, each line writes one `delivery` movement.

## Ledger rules

All of this lives in `lib/ledger` and the undo function. No other code writes to `stock_movements`.

| Rule | Definition |
| --- | --- |
| Stock now | `SUM(qty_delta)` for the ingredient |
| Stock at time T | `SUM(qty_delta) where occurred_at <= T` |
| Depletion | for each sale line with a mapped item: one `sale` movement per confirmed recipe line, `qty_delta = −(sale qty × recipe qty)`; then set `depleted_at` |
| Unmapped item | the sale line is stored with `depleted_at` null and written to the ledger when the item is mapped |
| Delivery | `+qty_base_unit` per confirmed delivery line |
| Waste | negative `waste` movement with a reason |
| Count approval | for each line: `theoretical_qty` = stock at `submitted_at`; write `count_adjust` of `counted_qty − theoretical_qty` (skip if zero) with `occurred_at = submitted_at` |
| Late movement | when any movement is appended with `occurred_at` earlier than an approved count of the same ingredient: find the first such count at or after `occurred_at`, append a `count_adjust` of the opposite amount on that count line, and add the movement's `qty_delta` to the line's `late_adjust_qty` |
| Import undo | `undo_sales_import(import_id)`: in one transaction, delete the import's sales, sale lines and their movements; for each deleted movement that preceded an approved count, apply the late-movement rule in reverse; set the import's status to `undone` |

The late-movement rule is general. It covers late sales, an older count approved after a newer one, and a delivery entered with a past date. Stock after the count is unchanged in every case, and the count's unexplained usage shows what it would have shown had everything been entered on time.

## Worked example against the tables

Mozzarella: `base_unit = g`, `cost_per_base_unit = 0.008000`.

| Step | Rows written | Stock |
| --- | --- | --- |
| Opening count of 2,000 g, approved | `count_lines`: counted 2000, theoretical 0, `is_opening = true`. Movement `count_adjust` +2000 | 2,000 g |
| Delivery of 5 × 1 kg bags | `delivery_lines`: pack count 5, qty 5000. Movement `delivery` +5000 | 7,000 g |
| 30 Margherita at 120 g | 30 sale lines' worth: movement `sale` −3600 | 3,400 g |
| 10 Quattro Formaggi at 80 g | movement `sale` −800 | **2,600 g** (stage 3 done check) |
| Dropped tray | movement `waste` −200, reason `dropped` | 2,400 g |
| Closing count of 1,900 g, approved | `count_lines`: counted 1900, theoretical 2400, unit cost 0.008. Movement `count_adjust` −500 | 1,900 g |

Unexplained usage: 1,900 − 2,400 = **−500 g**; −500 × 0.008 = **−€4.00** (stage 4 done check).

Late sale: if 5 more Margherita from that day are imported after the closing count is approved, the app writes `sale` −600 and `count_adjust` +600 on the closing count line, and sets `late_adjust_qty = −600`. Stock stays 1,900 g. Unexplained usage becomes 1,900 − (2,400 − 600) = +100 g.

## Deliberately left out

- A `current_stock` or any cached stock column.
- Sub-recipes, suppliers, purchase orders, forecasting tables: after the MVP.
- An invitations table: Supabase Auth invites plus a `memberships` row are enough.
- Cost history table: snapshots on count and delivery lines cover the MVP.
