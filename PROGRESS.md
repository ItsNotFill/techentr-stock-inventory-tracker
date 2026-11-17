# PROGRESS.md

Eight stages from `SPEC.md`. Stages 0 to 5 are the MVP, 6 is the pilot, 7 comes after. Each task is about an hour or less.

Rules:

- Do not start a stage until the previous one passes its done check.
- In stages 2 to 5 the manual tasks and the done check come first; the AI and offline tasks follow.
- Each stage is built on its own branch, `stage-<n>-<short-name>`, created from an up-to-date `main`.
- By default one agent, the main agent, works through the tasks in order. After each task it ticks the task here, commits, and pushes to the stage branch. Stage work never goes straight to `main`.
- Sub-agents are only for independent UI tasks, at most two at a time. Never run two tasks that touch the schema or migrations at the same time.
- The main agent checks each sub-agent result and gives an OK or a not-OK. Only after an OK does it tick the task and push. Sub-agents never push.
- When the stage's tasks are ticked and its done check passes, the main agent reviews the whole stage (tests, type check, lint, done check, `CLAUDE.md` rules, code quality), then merges the branch into `main` and pushes.
- The main agent then says the stage is finished and updates "Current stage" below. No agent starts the next stage, or picks up a task it was not given, before that.
- Then start the next stage on a new branch.
- Screens, forms, styling and small fixes go to the `ui-builder` sub-agent; the `reviewer` sub-agent checks every stage before the merge.
- Checkpoints: before a task starts it is written under "Now working on" below, with its branch and worktree. Long tasks get pushed `WIP:` commits. After a task: tick it, clear the line, commit, push.
- Every session starts with `git status`, `git worktree list` and the "Now working on" line; half-done work and leftover worktrees are finished or cleaned up first.
- Things only Filippo can do are listed in `NEXT_STEPS_FOR_FILIPPO.md`.

**Current stage: 4** (stages 0 to 3 are merged, manual paths. Waiting on Filippo: the Supabase address fix in Vercel and `.env.local`, and `ANTHROPIC_API_KEY` for the parked AI tasks; see `NEXT_STEPS_FOR_FILIPPO.md`)

**Now working on:** Stage 4 screens with two ui-builders, each in its own worktree under `.claude/worktrees/`, branched from `stage-4-count-variance`: (A) count list, count entry and manager approval (`/count`); (B) unexplained usage report (`/unexplained-usage`). Server code and Server Actions are on the stage branch. Meanwhile the main agent does seed script v4.

## Stage 0: Setup

- [x] Scaffold Next.js (App Router) with TypeScript strict, Tailwind and ESLint; add the `typecheck` script
- [x] Add shadcn/ui and the base components (button, input, table, dialog, form)
- [x] Add Vitest with one passing sample test; add the `test` script
- [x] Create the Supabase project; add `.env.example`, `.env.local` and the server and browser Supabase clients
- [x] Connect Drizzle: config, `db:generate` and `db:migrate` scripts, a test table migration applied to the database
- [x] Check the Drizzle RLS API names used in `SCHEMA.md` against the current docs; note any change in `DECISIONS.md`
- [ ] Create the Vercel project, set the environment variables, deploy `main` — **waiting on Filippo**: the clicks are in `NEXT_STEPS_FOR_FILIPPO.md`. Everything else in this stage is done; work continues with stage 1 meanwhile (DECISIONS.md, entry 42)

**Done when:** a blank page is live at a public URL and a test table exists in the DB.

## Stage 1: Auth and ingredients

- [x] Migration: enums, `organizations`, `locations`, `memberships`
- [x] Migration: `is_member()` and `has_role()` functions; RLS policies for the three tenancy tables
- [x] `lib/db/client.ts` (runs as the signed-in user) and `lib/db/admin.ts` (server only)
- [x] Sign-up and login pages with email; session handling in `proxy.ts` (the Next.js 16 name for middleware)
- [x] First-login onboarding: create organization, first location and owner membership
- [x] Role helpers and route guards for owner, manager, staff
- [x] Signed-in app shell with navigation, usable on a phone
- [x] Migration: `ingredients` and `pack_sizes` with RLS
- [x] `lib/units`: base-unit and pack conversion with `decimal.js`, plus tests
- [x] Ingredients screen: table with name, unit, reorder point, cost
- [x] Ingredient add and edit form with Zod validation
- [x] Pack sizes editor inside the ingredient form
- [x] Settings and team screen: restaurant details, invite a user, set roles
- [x] Seed script v1: pizzeria organization, location, three test users, ingredients and pack sizes
- [x] Isolation test: a second restaurant's account cannot read or write the first one's ingredients

**Done when:** two test accounts in different restaurants cannot see each other's ingredients.

## Stage 2: Menu and recipes

- [x] Migration: `menu_items` and `recipe_lines` with RLS
- [x] Menu screen: list of POS items with mapped, unmapped and ignored status
- [x] Menu item add and edit, including modifiers as their own items
- [x] Recipe editor: add ingredient and amount per item, in base units
- [x] Confirming a recipe sets `is_mapped`; removing every line clears it
- [x] Seed script v2: the pizzeria menu with recipes (Margherita 120 g mozzarella, Quattro Formaggi 80 g)
- [x] Run the done check by hand with a full pizzeria menu — done by a headless browser (`npm run test:e2e` enters an item and its recipe through the screens) and by `tests/integration/seed-pizzeria.test.ts` (the seeded 14-item menu has a recipe for every item). A person has not clicked through it yet

**Done when:** you can enter a real pizzeria's menu with recipes for every item.

AI onboarding (after the done check) — **parked: waiting for `ANTHROPIC_API_KEY`** (`NEXT_STEPS_FOR_FILIPPO.md`, section 3). Build these on a branch `stage-2-ai-onboarding` from `main` once the key is in `.env.local` (DECISIONS.md, entry 57):

- [ ] Private `photos` Storage bucket with its access policy; migration for `ai_extractions`
- [ ] `lib/ai`: Claude client, model from `AI_MODEL`, shared error and refusal handling, saving each call to `ai_extractions`
- [ ] Zod schema and prompt for reading menu screenshots; tests against saved example outputs
- [ ] Upload screen for POS screenshots, with image resizing and the notice that images go to an AI provider
- [ ] Review screen: fix names, merge duplicates, confirm to create menu items
- [ ] Zod schema and prompt for draft recipes; save as draft `recipe_lines` with `source = ai`
- [ ] Draft recipes in the recipe editor: marked as drafts, amounts editable, confirm per item
- [ ] Confirming a recipe creates or matches its ingredients; prompt for cost and pack size

## Stage 3: Sales import and depletion

- [x] Migration: `pos_import_mappings`, `sales_imports`, `sales`, `sale_lines` with RLS and `UNIQUE(location_id, pos_order_id)`
- [x] Migration: `stock_movements` with RLS, revoked update and delete, and the blocking triggers
- [x] `lib/ledger`: append movements, stock now, stock at a time; tests
- [x] Lock an ingredient's base unit once it has movements (extend `baseUnitLocked` in `lib/ingredients`)
- [x] Depletion function (sale lines × confirmed recipe lines → movements); tests including the 2,600 g example
- [x] CSV upload and parsing with Papa Parse
- [x] Column-mapping step, saved per POS in `pos_import_mappings`
- [x] Row validation with Zod and a preview table showing errors
- [x] Confirm import in one transaction: skip orders already imported, write sales, lines and movements, store the counts
- [x] Unknown POS items are created as unmapped menu items; their lines wait with `depleted_at` null
- [x] Unmapped items screen: map to a recipe or ignore; mapping back-fills depletion
- [x] `undo_sales_import()` database function and the undo button
- [x] Import history list with imported, skipped and unmapped counts
- [x] Seed script v3: opening stock and a delivery as movements, plus a sample sales CSV for the worked example
- [x] Theoretical stock column on the ingredients screen
- [x] Integration test: the same CSV twice changes stock once; undo restores it

**Done when:** uploading the same CSV twice changes stock only once, and the mozzarella worked example gives 2,600 g.

Sales by photo (after the done check) — **parked: waiting for `ANTHROPIC_API_KEY`** (DECISIONS.md, entry 57):

- [ ] Zod schema and prompt for end-of-day reports; tests against saved example outputs
- [ ] Photo upload creates a draft `sales_imports` row with the stored photo
- [ ] Match extracted item names to menu items; unmatched names go to the unmapped queue
- [ ] Confirmation screen: photo beside the extracted lines, editable quantities, business date
- [ ] Confirm writes one synthetic sale `eod:<date>`; warn when sales already exist for that date
- [ ] Clear message when the report shows only totals and payment types

## Stage 4: Stock count and variance

- [x] Migration: `count_sessions` and `count_lines` with RLS
- [x] `lib/variance`: unexplained usage in units and euros; tests including −500 g and −€4
- [ ] Mobile count screen: ingredients grouped by storage area, large inputs
- [ ] Count entry by pack or base unit, converted with `lib/units`
- [x] Save draft and submit; submit stores the provisional theoretical stock
- [ ] Manager approval screen: list of submitted counts, approve or reject with a note
- [x] Approval writes `count_adjust` movements as of `submitted_at`; opening counts are flagged
- [x] Late-movement correction in `lib/ledger`; tests for late sales, undo after a count, and counts approved out of order
- [x] Test: unexplained usage on a line always equals the sum of its `count_adjust` movements
- [ ] Unexplained usage report: per count, theoretical, counted and difference in units and euros, sorted by euros lost
- [x] Seed script v4: the worked example's waste movement and closing count

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
