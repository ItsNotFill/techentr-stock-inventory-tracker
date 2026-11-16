# CLAUDE.md

## Project summary

Restaurant inventory MVP: a responsive web app, installable as a PWA.
It turns POS sales into ingredient usage through recipes, then compares that theoretical stock with what staff count on the shelf.
The gap, shown in units and euros as "unexplained usage", is the product.
Users are the owner (money and reports), the manager (recipes, imports, approving counts) and staff (counting, deliveries, waste on a phone).
`SPEC.md` is the product spec, `SCHEMA.md` the database plan, `DECISIONS.md` the decision log, `PROGRESS.md` the task list.

## Tech stack

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

Additions decided in planning (see `DECISIONS.md`):

- AI vision: Claude API through `@anthropic-ai/sdk`, server side only. Model comes from `AI_MODEL` (default `claude-opus-5-5`).
- Tests: Vitest. Package manager: npm.
- Quantity maths in TypeScript: `decimal.js`. Never use JS `number` for quantities or money.
- PWA and offline counts: Serwist service worker, IndexedDB for count drafts.

Later, not now: a Python (FastAPI) forecasting service that reads the same database.

## Folder structure

```text
app/
  (auth)/               login, sign-up, first-login onboarding
  (app)/                signed-in screens
    dashboard/
    ingredients/
    menu/               menu items and recipe editor
    unmapped/           unmapped items queue
    import/             sales import by CSV and by photo
    count/              mobile stock count, manager approval
    unexplained-usage/  variance report
    deliveries/         log delivery, invoice photo
    waste/              log waste
    history/            stock history per ingredient
    settings/           restaurant details and team
  api/                  route handlers (uploads, AI reads)
  manifest.ts           PWA manifest
components/
  ui/                   shadcn/ui components
  ...                   feature components
lib/
  ai/                   the only place that calls the AI API
  db/
    schema/             Drizzle tables, enums, RLS policies
    client.ts           RLS-enforcing client (runs as the signed-in user)
    admin.ts            admin connection: migrations, seed, sign-up bootstrap only
  ledger/               append movements, stock queries, late-movement correction
  units/                base-unit and pack conversion
  variance/             unexplained-usage maths
  imports/              CSV parsing, column mapping, idempotent import, undo
  supabase/             server and browser Supabase clients
  validation/           shared Zod schemas
drizzle/                generated SQL migrations (never edit the DB by hand)
scripts/
  seed.ts               pizzeria example data from SPEC.md
tests/                  Vitest: depletion, variance, unit conversion, imports
public/                 icons and static assets
```

## Commands

These scripts are created in stage 0. Keep the names.

| Purpose | Command |
| --- | --- |
| Run locally | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Type check | `npm run typecheck` |
| Tests | `npm test` |
| Generate a migration from schema changes | `npm run db:generate` |
| Apply migrations | `npm run db:migrate` |
| Seed the pizzeria data | `npm run db:seed` |
| Deploy | `git push origin main` (Vercel deploys `main`; every other branch gets a preview URL) |

Environment variables live in `.env.local` (never committed) and are documented in `.env.example`:

| Variable | Where it may be read |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | server only |
| `DATABASE_URL` | server only |
| `ANTHROPIC_API_KEY` | server only |
| `AI_MODEL` | server only |

## Rules

- Stack: Next.js (App Router) + TypeScript strict, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle, Zod, Papa Parse, Recharts. Deploy on Vercel. PWA.
- AI vision: one server-side module (lib/ai/) for reading POS screenshots, end-of-day reports and supplier invoices. Always returns Zod-validated JSON. Results are drafts until a user confirms them.
- stock_movements is append-only. Stock = SUM(qty_delta). Never add a current_stock column.
- Quantities in base units (g, ml, unit) as numeric. Never floats.
- Imports are idempotent (unique pos_order_id per location) and undoable.
- Never disable RLS. Never expose the Supabase service key or AI API key to the browser.
- Schema changes only via Drizzle migrations.
- Write tests for depletion, variance and unit conversion. Run them before saying a task is done.
- Keep a seed script with the pizzeria example data from SPEC.md.
- After each task: update PROGRESS.md and commit with a clear message.
- Variance is called "unexplained usage" in the UI.

Git:

- After each task: update PROGRESS.md, commit with a clear message, and push to origin main. Never add Co-Authored-By, "Generated with Claude Code" or any other AI attribution to commits or PR descriptions.

## How the rules apply in code

- **Ledger.** All writes to `stock_movements` go through `lib/ledger`. Nothing else inserts into that table. The only delete is the import-undo database function. See `SCHEMA.md`, "Ledger rules".
- **RLS.** App queries use `lib/db/client.ts`, which runs as the signed-in user so policies apply. `lib/db/admin.ts` bypasses RLS and is imported only by migrations, the seed script and the sign-up bootstrap.
- **AI.** `lib/ai` uses `client.messages.parse()` with `zodOutputFormat()` so every result is validated against a Zod schema. Check `stop_reason` and a null `parsed_output` before using a result. Every result is saved as a draft in `ai_extractions`; nothing reaches the ledger until a user confirms. Use the `claude-api` skill when building this module.
- **Counts.** A count changes the ledger only when a manager or owner approves it.
- **Stages.** Work one stage at a time from `PROGRESS.md`. Do not start a stage until the previous one passes its done check.
- **Open design questions.** If something is not answered in `SPEC.md`, `SCHEMA.md` or `DECISIONS.md`, stop and ask. Record the answer in `DECISIONS.md`.
