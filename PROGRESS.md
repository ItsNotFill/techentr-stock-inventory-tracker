# PROGRESS.md

Eight stages from `SPEC.md`. Stages 0 to 5 are the MVP, 6 is the pilot, 7 comes after. Each task is about an hour or less.

Rules:

- Do not start a stage until the previous one passes its done check.
- In stages 2 to 5 the manual tasks and the done check come first; the AI and offline tasks follow.
- Each stage is built on its own branch, `stage-<n>-<short-name>`, created from an up-to-date `main`.
- After each task: tick it here, commit, push to the stage branch. Never push stage work straight to `main`.
- When the stage's tasks are ticked and its done check passes, hand it back to the main agent. It reviews the stage (tests, type check, lint, done check, `CLAUDE.md` rules, code quality), then merges the branch into `main` and pushes.
- Then start the next stage on a new branch.

**Current stage: 0**

## Stage 0: Setup

- [ ] Scaffold Next.js (App Router) with TypeScript strict, Tailwind and ESLint; add the `typecheck` script
- [ ] Add shadcn/ui and the base components (button, input, table, dialog, form)
- [ ] Add Vitest with one passing sample test; add the `test` script
- [ ] Create the Supabase project; add `.env.example`, `.env.local` and the server and browser Supabase clients
- [ ] Connect Drizzle: config, `db:generate` and `db:migrate` scripts, a test table migration applied to the database
- [ ] Check the Drizzle RLS API names used in `SCHEMA.md` against the current docs; note any change in `DECISIONS.md`
- [ ] Create the Vercel project, set the environment variables, deploy `main`

**Done when:** a blank page is live at a public URL and a test table exists in the DB.

## Stage 1: Auth and ingredients

- [ ] Migration: enums, `organizations`, `locations`, `memberships`
- [ ] Migration: `is_member()` and `has_role()` functions; RLS policies for the three tenancy tables
- [ ] `lib/db/client.ts` (runs as the signed-in user) and `lib/db/admin.ts` (server only)
- [ ] Sign-up and login pages with email; session handling in middleware
- [ ] First-login onboarding: create organization, first location and owner membership
- [ ] Role helpers and route guards for owner, manager, staff
- [ ] Signed-in app shell with navigation, usable on a phone
- [ ] Migration: `ingredients` and `pack_sizes` with RLS
- [ ] `lib/units`: base-unit and pack conversion with `decimal.js`, plus tests
- [ ] Ingredients screen: table with name, unit, reorder point, cost
- [ ] Ingredient add and edit form with Zod validation
- [ ] Pack sizes editor inside the ingredient form
- [ ] Settings and team screen: restaurant details, invite a user, set roles
- [ ] Seed script v1: pizzeria organization, location, three test users, ingredients and pack sizes
- [ ] Isolation test: a second restaurant's account cannot read or write the first one's ingredients

**Done when:** two test accounts in different restaurants cannot see each other's ingredients.

## Stage 2: Menu and recipes

- [ ] Migration: `menu_items` and `recipe_lines` with RLS
- [ ] Menu screen: list of POS items with mapped, unmapped and ignored status
- [ ] Menu item add and edit, including modifiers as their own items
- [ ] Recipe editor: add ingredient and amount per item, in base units
- [ ] Confirming a recipe sets `is_mapped`; removing every line clears it
- [ ] Seed script v2: the pizzeria menu with recipes (Margherita 120 g mozzarella, Quattro Formaggi 80 g)
- [ ] Run the done check by hand with a full pizzeria menu

**Done when:** you can enter a real pizzeria's menu with recipes for every item.

AI onboarding (after the done check):

- [ ] Private `photos` Storage bucket with its access policy; migration for `ai_extractions`
- [ ] `lib/ai`: Claude client, model from `AI_MODEL`, shared error and refusal handling, saving each call to `ai_extractions`
- [ ] Zod schema and prompt for reading menu screenshots; tests against saved example outputs
- [ ] Upload screen for POS screenshots, with image resizing and the notice that images go to an AI provider
- [ ] Review screen: fix names, merge duplicates, confirm to create menu items
- [ ] Zod schema and prompt for draft recipes; save as draft `recipe_lines` with `source = ai`
- [ ] Draft recipes in the recipe editor: marked as drafts, amounts editable, confirm per item
- [ ] Confirming a recipe creates or matches its ingredients; prompt for cost and pack size

## Stage 3: Sales import and depletion

- [ ] Migration: `pos_import_mappings`, `sales_imports`, `sales`, `sale_lines` with RLS and `UNIQUE(location_id, pos_order_id)`
- [ ] Migration: `stock_movements` with RLS, revoked update and delete, and the blocking triggers
- [ ] `lib/ledger`: append movements, stock now, stock at a time; tests
- [ ] Depletion function (sale lines × confirmed recipe lines → movements); tests including the 2,600 g example
- [ ] CSV upload and parsing with Papa Parse
- [ ] Column-mapping step, saved per POS in `pos_import_mappings`
- [ ] Row validation with Zod and a preview table showing errors
- [ ] Confirm import in one transaction: skip orders already imported, write sales, lines and movements, store the counts
- [ ] Unknown POS items are created as unmapped menu items; their lines wait with `depleted_at` null
- [ ] Unmapped items screen: map to a recipe or ignore; mapping back-fills depletion
- [ ] `undo_sales_import()` database function and the undo button
- [ ] Import history list with imported, skipped and unmapped counts
- [ ] Seed script v3: opening stock and a delivery as movements, plus a sample sales CSV for the worked example
- [ ] Theoretical stock column on the ingredients screen
- [ ] Integration test: the same CSV twice changes stock once; undo restores it

**Done when:** uploading the same CSV twice changes stock only once, and the mozzarella worked example gives 2,600 g.

Sales by photo (after the done check):

- [ ] Zod schema and prompt for end-of-day reports; tests against saved example outputs
- [ ] Photo upload creates a draft `sales_imports` row with the stored photo
- [ ] Match extracted item names to menu items; unmatched names go to the unmapped queue
- [ ] Confirmation screen: photo beside the extracted lines, editable quantities, business date
- [ ] Confirm writes one synthetic sale `eod:<date>`; warn when sales already exist for that date
- [ ] Clear message when the report shows only totals and payment types

## Stage 4: Stock count and variance

- [ ] Migration: `count_sessions` and `count_lines` with RLS
- [ ] `lib/variance`: unexplained usage in units and euros; tests including −500 g and −€4
- [ ] Mobile count screen: ingredients grouped by storage area, large inputs
- [ ] Count entry by pack or base unit, converted with `lib/units`
- [ ] Save draft and submit; submit stores the provisional theoretical stock
- [ ] Manager approval screen: list of submitted counts, approve or reject with a note
- [ ] Approval writes `count_adjust` movements as of `submitted_at`; opening counts are flagged
- [ ] Late-movement correction in `lib/ledger`; tests for late sales, undo after a count, and counts approved out of order
- [ ] Test: unexplained usage on a line always equals the sum of its `count_adjust` movements
- [ ] Unexplained usage report: per count, theoretical, counted and difference in units and euros, sorted by euros lost
- [ ] Seed script v4: the worked example's waste movement and closing count

**Done when:** the worked example's closing count shows −500 g and −€4.

Offline counting (after the done check):

- [ ] Save count drafts to IndexedDB as they are typed
- [ ] Sync on reconnect, idempotent through `client_id`
- [ ] Offline and "waiting to sync" indicator; test in airplane mode

## Stage 5: Deliveries, waste, dashboard, PWA

- [ ] Migration: `deliveries` and `delivery_lines` with RLS
- [ ] Log delivery screen (mobile): ingredient, pack, quantity; writes a confirmed delivery and its movements
- [ ] Log waste screen (mobile): ingredient, quantity, reason
- [ ] Low-stock query: theoretical stock below reorder point
- [ ] Dashboard: low-stock list, last import, last count's total unexplained usage in euros
- [ ] Dashboard: top five unexplained-usage ingredients chart with Recharts
- [ ] Stock history screen: every movement for one ingredient, filtered by type and date
- [ ] PWA manifest and icons
- [ ] Service worker with Serwist; app shell loads offline
- [ ] Install on a real phone and log a delivery from the home-screen icon

**Done when:** a staff member can log a delivery from a phone home-screen icon. **MVP complete.**

Restock by invoice photo (after the done check):

- [ ] Zod schema and prompt for supplier invoices; tests against saved example outputs
- [ ] Photo upload creates a draft delivery with the stored photo
- [ ] Match invoice lines to ingredients and pack sizes
- [ ] Confirmation screen: photo beside the lines, editable quantities and costs, per-line "update cost"
- [ ] Confirm (manager or owner) writes movements and updates ingredient costs; warn on a repeated invoice number

## Stage 6: Pilot

- [ ] Agree the pilot restaurant and get a real sales CSV export and an end-of-day report
- [ ] Set up the restaurant: location, team, ingredients, menu and recipes
- [ ] Import one real week of sales; fix what the export breaks
- [ ] Add one POS API, chosen by the pilot's POS
- [ ] First weekly count together with the restaurant
- [ ] Triage and fix the issues they hit
- [ ] Write down their feedback

**Done when:** the restaurant does at least one weekly count without your help, and you have their feedback written down.

## Stage 7: After the MVP

Not broken into tasks yet. Plan each item when it is picked up.

- [ ] Sub-recipes and batch prep
- [ ] Weekly owner summary by email
- [ ] Email alerts for low stock
- [ ] Forecasting service (Python) and order suggestions
- [ ] Multiple locations in the UI
- [ ] Purchase orders and supplier management
- [ ] Payments and billing
- [ ] Native app, if the PWA falls short

SPEC.md gives this stage no done check.
