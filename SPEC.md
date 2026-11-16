# Restaurant Inventory App — MVP System Design

Nov 16, 2026 · @Filippo Morini

## Overview

The app tells a restaurant what it *should* have in stock based on what it sold, then shows the gap against what is actually on the shelf. That gap (the variance) is the product's main selling point: it exposes over-portioning, waste and theft without anyone tracking ingredients by hand during service.

The core loop:

1. **Sales in.** POS sales arrive, first by CSV export and later through a POS API.
2. **Recipes turn sales into ingredients.** Every menu item has a recipe in base units, e.g. 1 Margherita = 120 g mozzarella.
3. **Depletion.** Each sale writes ingredient deductions to a stock ledger.
4. **Deliveries and waste** add to or subtract from the same ledger.
5. **Count.** Staff count the real stock on a phone.
6. **Variance.** Counted − theoretical = what went missing, in units and in euros.

**Users:** the owner (sees money and variance), the manager (sets up recipes, imports sales, approves counts) and staff (count stock, log waste and deliveries on a phone).

**Form:** a responsive web app installable as a PWA. A native app is only considered after the pilot.

## System diagram

&#91;embedded content: system architecture · inputs, Next.js app, Supabase\]

Browsers, phones and POS data reach only the Next.js app. Only the app writes to Postgres, and every stock change lands in the `stock_movements` ledger.

## Tech stack

One TypeScript codebase, one Postgres database, one deploy. AI coding tools handle this stack well because it is common.

| Layer | Tool | Why |
| --- | --- | --- |
| Language | TypeScript | Same language front and back; types catch unit and quantity mix-ups |
| App framework | Next.js (App Router) | Pages, API routes and server logic in one project |
| Database | PostgreSQL on Supabase | Relational data; auth, storage and a hosted DB included |
| ORM / migrations | Drizzle | Typed queries; schema lives in code, so the AI can read it |
| Auth | Supabase Auth | Email login; Row Level Security keeps each restaurant's data apart |
| UI | Tailwind + shadcn/ui | Ready-made tables, forms, dialogs |
| CSV parsing | Papa Parse | Handles messy POS exports in the browser or server |
| Validation | Zod | Checks every import row and form before it touches the DB |
| Charts | Recharts | Variance and usage charts on the dashboard |
| Hosting | Vercel + Supabase | Push-to-deploy, preview URLs per branch, scheduled jobs |
| Mobile | PWA | Installable from the browser; no app store |

Later, not now: a Python (FastAPI) service for forecasting that reads the same database.

## How it works

Every stock change becomes one row in `stock_movements`. Current stock is never stored; it is always the sum of that ledger.

### 1. Sales import

1. Manager uploads the POS sales CSV (or, later, a nightly job pulls it from the POS API).
2. The app matches CSV columns to fields once (order ID, item name/ID, quantity, time) and remembers that mapping per POS.
3. Each row is validated. Orders already imported are skipped, using `pos_order_id`.
4. Items with no recipe go to the **Unmapped items** queue instead of being dropped.
5. Mapped items write one `sale` movement per ingredient: quantity sold × recipe amount, as a negative number.

### 2. Deliveries and waste

- **Delivery:** staff pick the ingredient and the pack ("2 × case 12×1 L"); the app converts to base units and writes a positive `delivery` movement.
- **Waste:** staff log what was thrown away and why (expired, dropped, burnt) as a negative `waste` movement.

### 3. Stock count and variance

1. Staff open a count session on a phone and enter what they see, ingredient by ingredient.
2. The app saves the theoretical quantity at that moment next to each counted quantity.
3. On submit, a `count_adjust` movement brings the ledger in line with reality.
4. Variance = counted − theoretical, also shown in euros via cost per unit.

### 4. Alerts

After every import or count, ingredients whose theoretical stock drops below their reorder point are flagged on the dashboard. Email alerts come later.

### Worked example: mozzarella over one day

| Step | Movement | Ledger total |
| --- | --- | --- |
| Opening count | — | 2,000 g |
| Delivery: 5 × 1 kg bags | +5,000 g | 7,000 g |
| 30 Margherita sold (120 g each) | −3,600 g | 3,400 g |
| 10 Quattro Formaggi sold (80 g each) | −800 g | 2,600 g |
| Waste logged: dropped tray | −200 g | 2,400 g (theoretical) |
| Closing count | counted 1,900 g | variance −500 g |

At €8 per kg, the −500 g variance is €4 of mozzarella unaccounted for in one day. That number, across every ingredient and every week, is what the owner pays for.

### 5. AI-assisted onboarding (stage 2)

The owner uploads screenshots or photos of their POS menu screens instead of typing the menu. No custom model is trained: a vision model (Claude or GPT API) does the reading.

1. **Read the menu.** The model returns structured JSON: item names, categories, prices if visible, modifiers.
2. **Review.** The owner sees the list, fixes names, merges duplicates, confirms.
3. **Draft recipes.** For each item the model proposes a starting recipe in base units, e.g. mojito = 50 ml white rum, 0.5 lime, 8 g mint, 20 ml sugar syrup, 60 ml soda.
4. **Adjust.** The owner only corrects amounts to their real portions. Every AI suggestion is marked as a draft until confirmed.
5. **Build ingredients.** Ingredients mentioned in confirmed recipes are created automatically; the owner adds cost and pack size.

### 6. Sales by photo (alongside CSV)

Staff photograph the printed end-of-day register report. The vision model extracts item and quantity pairs (13 mojito, 2 Aperol Spritz, 5 burger), matches them to menu items, and shows a confirmation screen before anything is deducted.

- Check early: some end-of-day reports show only totals and payment types. The register must print an item-level sales report for this to work.
- Store each photo with its import, so a wrong reading can be traced and undone.

### Other things to design for

- **Modifiers.** "Double shot" or "extra cheese" change usage; treat them as their own items with their own recipe lines.
- **Batch prep.** House mojito mix or a tomato sauce is made from several ingredients; needs sub-recipes soon after the MVP.
- **Menu changes.** New or renamed POS items land in the unmapped queue; the AI can suggest a match.
- **Framing.** Variance is shown as "unexplained usage" and tied to portioning, costing and waste, not staff surveillance.
- **AI cost and privacy.** Each photo is one API call (cents, not euros); store only what's needed and tell users their images go to an AI provider.

## Data model

Fourteen tables in Postgres. Every row belongs to one location, either directly through `location_id` or through its parent row, so Row Level Security can limit each user to their own restaurant.

| Table | Key fields | Purpose |
| --- | --- | --- |
| `organizations` | id, name, plan | The paying customer (one owner, one or more locations) |
| `locations` | id, org\_id, name, pos\_provider, timezone | One restaurant |
| `memberships` | user\_id, location\_id, role (owner / manager / staff) | Who can do what where; users themselves live in Supabase Auth |
| `ingredients` | id, name, base\_unit (g / ml / unit), cost\_per\_base\_unit, par\_level, reorder\_point, category | What is stocked |
| `pack_sizes` | id, ingredient\_id, label, qty\_in\_base\_unit | "Case 12×1 L" = 12,000 ml, used for deliveries and counts |
| `menu_items` | id, pos\_item\_id, pos\_name, display\_name, is\_mapped | Items as the POS names them, modifiers included |
| `recipe_lines` | menu\_item\_id, ingredient\_id, qty\_base\_unit | Bill of materials: how much of each ingredient one item uses |
| `pos_import_mappings` | location\_id, column\_map (json) | Remembers which CSV column is which |
| `sales_imports` | id, file\_name, imported\_by, row\_count, skipped\_count, created\_at | One record per upload, for audit and undo |
| `sales` | id, import\_id, pos\_order\_id (unique per location), sold\_at | One POS order |
| `sale_lines` | sale\_id, menu\_item\_id, qty | Items within an order |
| `stock_movements` | id, ingredient\_id, qty\_delta, type, ref\_table, ref\_id, note, created\_by, created\_at | The ledger: sale, delivery, waste, count\_adjust |
| `count_sessions` + `count_lines` | session: counted\_by, status, submitted\_at · line: ingredient\_id, counted\_qty, theoretical\_qty | Physical counts and the variance snapshot |

### Design rules

- **Ledger, not a stock column.** Stock = `SUM(qty_delta)` per ingredient. Any number can be traced to the movements behind it.
- **Base units only.** Store grams, millilitres or pieces as `numeric`, never floats. Convert to packs only on screen.
- **Idempotent imports.** `UNIQUE(location_id, pos_order_id)` means re-uploading a file never double-deducts.
- **Undo by import.** Deleting a `sales_imports` row removes its sales and their movements, so a wrong file can be reverted.
- **Nothing silently lost.** Unmapped POS items are stored and queued; once mapped, the app back-fills their depletion.
- **Movements are append-only.** Corrections are new movements, never edits, which keeps the history trustworthy.

## MVP scope

The MVP is eleven screens for one restaurant: set up recipes, import a day of sales, count stock and see the variance in euros.

| Screen | Used by | What it shows and does |
| --- | --- | --- |
| Login / sign-up | Everyone | Email login; owner creates the organization and first location |
| Dashboard | Owner, manager | Low-stock list, last import, last count's total variance in €, top 5 variance ingredients |
| Ingredients | Manager | Table: name, unit, theoretical stock, reorder point, cost; add/edit, pack sizes |
| Menu & recipes | Manager | POS items with mapped/unmapped status; recipe editor (ingredient + amount per item) |
| Unmapped items | Manager | Queue of POS items seen in sales without a recipe; map in one click |
| Import sales | Manager | Upload CSV, map columns once, preview rows, confirm; shows imported/skipped counts; undo |
| Stock count (mobile) | Staff | Big-button list grouped by storage area; type the counted amount; submit |
| Variance report | Owner, manager | Per count: theoretical vs counted vs difference, in units and €, sorted by € lost |
| Log delivery / waste (mobile) | Staff | Pick ingredient + pack + quantity (delivery) or + reason (waste) |
| Stock history | Manager | Every movement for one ingredient, filterable by type and date |
| Settings & team | Owner | Invite users, set roles, restaurant details |

### MVP vs full product

| Feature | MVP | Full product |
| --- | --- | --- |
| Sales import by CSV | Yes | Yes |
| Sales import by photo of end-of-day report | Yes | Yes |
| AI onboarding from POS screenshots + draft recipes | Yes | Yes |
| Stock counts, deliveries, waste, unexplained-usage report | Yes | Yes |
| Offline stock counting (saves on phone, syncs later) | Yes, basic | Full offline for all mobile screens |
| Restock by photo of supplier invoice (adds stock + updates costs) | Yes | Yes |
| Weekly owner summary (email or message) | — | Yes |
| Live POS API sync | — | Yes |
| Sub-recipes / batch prep | — | Yes |
| Forecasting and order suggestions | — | Yes |
| Purchase orders, supplier management | — | Yes |
| Multiple locations in the UI | — | Yes (data model ready) |
| Native iOS / Android app | — | If the PWA falls short |
| Payments and billing | — | Yes |

**Offline counting** matters because walk-in fridges and cellars often have no signal. **Invoice photos** mirror the sales photo: one picture logs the delivery and keeps ingredient costs current, so the € figures stay accurate. **The weekly summary** ("you used €40 more mozzarella than expected") may be what owners value most.

## Development stages

Eight stages, each ending in something you can demo. Stages 0–5 are the MVP; 6 is the pilot; 7 is after it. Don't start a stage until the previous one passes its done check.

0. **Setup.** Repo on GitHub, Next.js + Tailwind + shadcn/ui, Supabase project, Drizzle connected, deployed to Vercel.
   - Done when: a blank page is live at a public URL and a test table exists in the DB.
1. **Auth and ingredients.** Sign-up, login, organization + location created on first login, roles, RLS policies. Ingredients CRUD with pack sizes.
   - Done when: two test accounts in different restaurants cannot see each other's ingredients.
2. **Menu and recipes.** Menu items, recipe editor, mapped/unmapped status.
   - Done when: you can enter a real pizzeria's menu with recipes for every item.
3. **Sales import and depletion.** CSV upload, column mapping, preview, idempotent import, depletion movements, unmapped queue, undo.
   - Done when: uploading the same CSV twice changes stock only once, and the mozzarella worked example gives 2,600 g.
4. **Stock count and variance.** Mobile count screen, theoretical snapshot, count adjustments, variance report in units and €.
   - Done when: the worked example's closing count shows −500 g and −€4.
5. **Deliveries, waste, dashboard, PWA.** Delivery and waste logging, reorder alerts, dashboard, stock history, installable PWA.
   - Done when: a staff member can log a delivery from a phone home-screen icon. **MVP complete.**
6. **Pilot.** One real restaurant uses it for 2–4 weeks on its real POS exports. Add one POS API (pick based on the pilot's POS). Fix what they hit.
   - Done when: the restaurant does at least one weekly count without your help, and you have their feedback written down.
7. **After the MVP.** Forecasting service (Python), sub-recipes, order suggestions, multiple locations, email alerts, billing, native app if the PWA falls short.

## Vibe-coding workflow and open questions

Give the AI this doc as its spec and build one stage per session. Small, checked steps beat one giant prompt.

### How to run each stage

1. Put this doc (or a copy as `CLAUDE.md` / `SPEC.md`) in the repo root so every session starts from the same spec.
2. Prompt one stage at a time: "Build stage 3 as described in SPEC.md. Stop when the done check passes."
3. Ask for a seed script with the pizzeria example data, so every stage can be tested on the same numbers.
4. Ask for automated tests on the depletion and variance maths. This is the part that must never be wrong.
5. Run the done check yourself in the browser, then commit and push. Vercel gives each branch a preview URL to share with the team.
6. Keep a short `DECISIONS.md` log so later sessions don't undo earlier choices.

### Guardrails to give the AI

- Never disable Row Level Security or put the Supabase service key in browser code.
- All schema changes go through Drizzle migrations, never manual DB edits.
- Stock movements are append-only; no update or delete on that table except through an import undo.

### Risks

- **Recipe setup effort.** Restaurants may not enter 40 recipes. Mitigation: a fast recipe editor, CSV recipe import, and offering to do setup for pilots.
- **Messy POS exports.** Each POS formats CSVs differently. Mitigation: the column-mapping step, and getting a real export early.
- **Units sold vs units stocked.** Wine is bought by the bottle and sold by the glass. Base units (ml) handle it, but recipes must be entered in ml.

### Open questions

- [ ] Which restaurant will pilot it, and which POS do they use?
- [ ] Can we get a real sales CSV export from that POS before stage 3?
- [ ] Does the course need a live demo, a recorded one, or only the pitch?
- [ ] Who on the team owns the build, and who owns recipes and pilot contact?
- [ ] Pricing model to test: per location per month, or free pilot first?

## Claude Code kickoff pack

Copy these into the project. Step 1 once; step 2 at the start of every session.

### Step 0: setup (5 minutes, by hand)

1. Create an empty GitHub repo, clone it, open a terminal in it.
2. Export this whole doc as Markdown and save it as `SPEC.md` in the repo root.
3. Create a free Supabase project and a Vercel account; keep the Supabase URL and keys ready for a `.env.local` file (never commit it).
4. Run `claude` in the repo folder. Switch to plan mode with Shift+Tab.

### Step 1: first session (use Fable / the strongest model)

Paste this in plan mode:

```text
Read SPEC.md fully. It is the product spec for a restaurant inventory MVP.

Your job this session is planning only, no app code yet:
1. Create CLAUDE.md with: project summary (5 lines), the tech stack exactly as in SPEC.md, folder structure, coding rules, the guardrails from SPEC.md, and commands to run/test/deploy.
2. Create PROGRESS.md: the 8 development stages from SPEC.md, each broken into small tasks (max ~1 hour each) as checkboxes, each stage with its done check.
3. Create DECISIONS.md with the key design decisions (ledger table, base units, idempotent imports, AI photo reading with a confirmation screen, unexplained-usage framing).
4. Write the full Drizzle schema plan for all tables in SPEC.md's data model, including the AI-related fields (photo storage path, AI draft vs confirmed flags on recipes and imports).

Ask me any questions where SPEC.md is ambiguous before writing files. Show me the plan first.
```

### CLAUDE.md rules to make sure it includes

```text
- Stack: Next.js (App Router) + TypeScript strict, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle, Zod, Papa Parse, Recharts. Deploy on Vercel. PWA.
- AI vision: one server-side module (lib/ai/) for reading POS screenshots, end-of-day reports and supplier invoices. Always returns Zod-validated JSON. Results are drafts until a user confirms them.
- stock_movements is append-only. Stock = SUM(qty_delta). Never add a current_stock column.
- Quantities in base units (g, ml, unit) as numeric. Never floats.
- Imports are idempotent (unique pos_order_id per location) and undoable.
- Never disable RLS. Never expose the Supabase service key or AI API key to the browser.
- Schema changes only via Drizzle migrations.
- Write tests for depletion, variance and unit conversion. Run them before saying a task is done.
- Keep a seed script with the pizzeria example data from SPEC.md.
- After each task: update PROGRESS.md, commit with a clear message.
- Variance is called "unexplained usage" in the UI.
```

### Step 2: every later session

Start a fresh session (or `/clear`), plan mode on, then:

```text
Read CLAUDE.md and PROGRESS.md. Pick the next unchecked tasks in the current stage, up to about 1 hour of work.
Show me a plan first. After I approve: build, run the tests, check it in the browser if needed, tick the tasks in PROGRESS.md, commit.
If you hit a design question not answered in SPEC.md or DECISIONS.md, stop and ask me.
```

### Using the limits well

- Strongest model for: step 1, the database schema, stage 3 (import + depletion), the AI photo module, and debugging something stuck. Cheaper model for screens, styling, small fixes.
- One stage (or half a stage) per five-hour window. End each window with PROGRESS.md updated and everything committed.
- Reject a bad plan instead of letting it code and fixing later; that is what saves the most usage.
- If a session gets long or confused, `/clear` and restart from PROGRESS.md rather than arguing with it.
- Give it error messages and screenshots directly; don't describe them.
