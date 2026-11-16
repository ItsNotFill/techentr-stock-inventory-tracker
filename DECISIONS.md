# DECISIONS.md

A short log of design decisions, so later sessions do not undo earlier choices. Add new entries at the bottom with the date. Change a decision only by adding a new entry that replaces it.

## Core design (from SPEC.md)

| # | Decision | Reasoning |
| --- | --- | --- |
| 1 | **Ledger table.** Every stock change is one row in `stock_movements`; stock is `SUM(qty_delta)`; there is no `current_stock` column. | Any stock figure can be traced to the movements behind it, and there is no second number that can drift out of sync. |
| 2 | **Base units.** Quantities are stored in g, ml or unit as `numeric`, never floats; packs are converted on screen only. | One unit per ingredient removes conversion bugs, and exact decimals keep the euro figures exact. |
| 3 | **Idempotent imports.** `UNIQUE(location_id, pos_order_id)` on `sales`; orders already imported are skipped. | Uploading the same file twice must never deduct stock twice. |
| 4 | **AI photo reading with a confirmation screen.** A vision model reads POS screenshots, end-of-day reports and supplier invoices; every result is a draft until a user confirms it, and the photo is stored with it. | The model can misread, so a person checks before anything touches stock, and a wrong reading can be traced back to its photo and undone. |
| 5 | **"Unexplained usage" framing.** Variance is called "unexplained usage" in the UI and tied to portioning, costing and waste. | Owners buy a cost tool; staff will not use something that feels like surveillance. |

## Decided in the planning session (2026-11-16)

| # | Decision | Reasoning |
| --- | --- | --- |
| 6 | **AI and offline tasks are folded into stages 2 to 5**, after each stage's manual path and done check. | The maths is proven by hand before AI is added on top, and the plan stays at eight stages. |
| 7 | **AI provider is the Claude API**, called only from `lib/ai` on the server, with the model set by `AI_MODEL` (default `claude-opus-5-5`). | One provider keeps the module small; an env var lets us switch to a cheaper model without a code change. |
| 8 | **A count changes the ledger only after a manager or owner approves it.** Statuses: draft, submitted, approved, rejected. A manager or owner who counts can submit and approve in one step. | A typo in a count would otherwise rewrite stock and the euro report immediately. |
| 9 | **Count time is the moment staff submit.** On approval, theoretical stock is computed as of that moment. | Sales and deliveries recorded between submit and approval must not be swallowed by the count. |
| 10 | **Late movements are auto-corrected.** A movement dated before an approved count but recorded after it also writes an offsetting `count_adjust` on that count, and the count's unexplained usage is recomputed. | The count already absorbed those sales, so deducting them again would double-count; this keeps stock right whatever order things are entered in. |
| 11 | **Movements carry two timestamps:** `occurred_at` (when it happened) and `created_at` (when it was recorded). | Decisions 9 and 10 need to know what stock was at a past moment, which insertion time alone cannot tell. |
| 12 | **Import undo deletes the import's sales and their movements** inside one database function, the only path allowed to delete from `stock_movements`. The `sales_imports` row stays with status `undone`. | SPEC.md asks for deletion so the file can be re-imported cleanly; keeping the import row preserves the audit trail and the photo. |
| 13 | **Opening counts are flagged** (`count_lines.is_opening`) and left out of unexplained-usage totals. | The first count of an ingredient has no theoretical stock, so its "variance" is just the opening balance. |
| 14 | **`location_id` is on every table**, including child tables. | One RLS policy shape covers everything, with no joins inside policies. |
| 15 | **Three tables beyond the spec's fourteen:** `deliveries`, `delivery_lines`, `ai_extractions`. | Invoice photos need a draft that can be reviewed before stock is added; every AI read needs its photo, raw output and status kept. |
| 16 | **Draft AI recipe lines may name an ingredient that does not exist yet** (`draft_ingredient_name`); the ingredient is created or matched when the recipe is confirmed. | SPEC.md creates ingredients from confirmed recipes, so a draft cannot require them up front. |
| 17 | **Only confirmed recipe lines deplete stock.** `menu_items.is_mapped` is true only when the item has a confirmed recipe. | An unreviewed AI guess must never move stock. |
| 18 | **Recipe changes apply to future sales only.** Movements already written are not recalculated. | The ledger is append-only; rewriting history would make past reports change under the owner's feet. |
| 19 | **Photo sales use one synthetic order per report**, `pos_order_id = eod:<business date>`, and the app warns if CSV sales already exist for that date. | An end-of-day report has no order IDs; this keeps the idempotency rule and catches the same day entered twice. |
| 20 | **Invoice-photo deliveries are confirmed by a manager or owner**; staff can upload the photo and log manual deliveries. | Confirming an invoice updates ingredient costs, which drives every euro figure. |
| 21 | **Cost snapshots** are stored on `count_lines.unit_cost` and `delivery_lines.unit_cost`. | Past euro figures must not move when an ingredient's cost changes later. |
| 22 | **POS items that use no stock can be ignored** (`menu_items.is_ignored`). | Service charges and gift cards would otherwise sit in the unmapped queue for ever. |
| 23 | **RLS is enforced through Drizzle:** app queries run as the signed-in user through `lib/db/client.ts`; `lib/db/admin.ts` bypasses RLS and is used only for migrations, seed and sign-up bootstrap. | A plain Drizzle connection uses a privileged role that silently skips RLS, which would break tenant isolation. |
| 24 | **All members of a location can read its rows; writes depend on role.** Hiding costs and theoretical stock from staff is done in the screens. | Postgres RLS works on rows, not columns; column-level rules are not worth the complexity for the MVP. |
| 25 | **Tooling:** npm, Vitest, `decimal.js` for quantity maths, Serwist and IndexedDB for the PWA and offline counts. | Common, well-documented choices; `decimal.js` because Postgres `numeric` arrives in JS as a string and JS numbers are floats. |
| 26 | **Refunds are sale lines with a negative quantity**, which write positive movements. | A refunded item was not used, and corrections must be new movements, not edits. |
| 27 | **Supabase project setup:** automatic RLS is on for new tables, and new tables are not exposed to the Data API. All table access goes through Drizzle on the server; `supabase-js` is used only for Auth and Storage. | With the Data API closed, the browser's anon key cannot reach any table, so a missing or wrong policy cannot leak data; RLS stays on as the second layer behind the server. |

## Open questions (from SPEC.md, still open)

- Which restaurant will pilot it, and which POS do they use?
- Can we get a real sales CSV export from that POS before stage 3?
- Does the register print an item-level end-of-day report? Photo import needs one.
- Does the course need a live demo, a recorded one, or only the pitch?
- Who on the team owns the build, and who owns recipes and pilot contact?
- Pricing model to test: per location per month, or free pilot first?
