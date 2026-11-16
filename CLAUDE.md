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

- AI vision: Claude API through `@anthropic-ai/sdk`, server side only. Model comes from `AI_MODEL` (default `claude-sonnet-5-5`).
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
proxy.ts                session refresh and sign-in redirects (Next.js 16 name for middleware)
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
  supabase/             server and browser Supabase clients (Auth and Storage only)
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
| Check both database URLs connect | `npm run db:check` |
| Preview a stage | `git push origin stage-<n>-<short-name>` (Vercel gives every branch a preview URL) |
| Deploy | merge the reviewed stage branch into `main` and `git push origin main` (Vercel deploys `main`) |

Environment variables live in `.env.local` (never committed) and are documented in `.env.example`:

| Variable | Where it may be read |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser and server |
| `SUPABASE_SECRET_KEY` | server only |
| `DATABASE_URL` | server only |
| `DATABASE_URL_MIGRATIONS` | server only: drizzle-kit and the seed script |
| `ANTHROPIC_API_KEY` | server only |
| `AI_MODEL` | server only |

- The Supabase keys are the new publishable and secret keys, not the old `anon` and `service_role` keys.
- `DATABASE_URL` is the transaction pooler (port 6543). The app's Drizzle client must be created with `prepare: false`, because that pooler does not support prepared statements.
- `DATABASE_URL_MIGRATIONS` is the session pooler (port 5432). `drizzle-kit` migrations and the seed script use it.
- `.env.local` holds real values. Never print it, commit it or overwrite it.

## Rules

- Stack: Next.js (App Router) + TypeScript strict, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle, Zod, Papa Parse, Recharts. Deploy on Vercel. PWA.
- AI vision: one server-side module (lib/ai/) for reading POS screenshots, end-of-day reports and supplier invoices. Always returns Zod-validated JSON. Results are drafts until a user confirms them.
- stock_movements is append-only. Stock = SUM(qty_delta). Never add a current_stock column.
- Quantities in base units (g, ml, unit) as numeric. Never floats.
- Imports are idempotent (unique pos_order_id per location) and undoable.
- Never disable RLS. Never expose the Supabase secret key or AI API key to the browser.
- Schema changes only via Drizzle migrations.
- Write tests for depletion, variance and unit conversion. Run them before saying a task is done.
- Keep a seed script with the pizzeria example data from SPEC.md.
- After each task: update PROGRESS.md and commit with a clear message.
- Variance is called "unexplained usage" in the UI.

Agents (standard practice for every stage):

- The main agent orchestrates and works through the stage's tasks in order. It is the only one that pushes.
- The main agent does these itself: schema, migrations, ledger, depletion, variance, import logic and `lib/ai`.
- Screens, forms, styling and small fixes are delegated to the `ui-builder` sub-agent (`.claude/agents/ui-builder.md`), one task at a time.
- The `reviewer` sub-agent (`.claude/agents/reviewer.md`) reviews every stage before it is merged. It is read-only and returns OK or a list of fixes.
- Work is sequential. Two `ui-builder` agents may run at the same time only on screens that do not depend on each other or on unfinished work and do not touch the same files. Never more than two.
- Never run two tasks that touch the schema or migrations at the same time. This counts the main agent's own task. Schema and migration work is done by one agent, in sequence.
- Each sub-agent works in its own git worktree, commits there, and never pushes.
- After handing out work, the main agent waits until a sub-agent comes back with something to show. It does not do that sub-agent's task in the meantime.
- The main agent checks what comes back: tests, type check, lint, the rules in this file, and code quality. It then gives the sub-agent an OK or a not-OK.
- Not OK: the main agent says what to fix and the same sub-agent fixes it. Nothing is pushed.
- OK: the main agent puts the work on the stage branch, ticks the task in PROGRESS.md, and pushes.
- A sub-agent does only the task it was given. It does not pick up the next task on its own.
- No agent starts work on the next stage until the main agent has said the current stage is finished. The main agent says so only after the whole-stage review has passed, the branch is merged into `main`, and "Current stage" in PROGRESS.md is updated.

Autonomy (the main agent runs without waiting for approval):

- Do not stop for a question you can answer reasonably. Pick the option most consistent with `SPEC.md` and `DECISIONS.md`, record it in `DECISIONS.md`, and continue.
- Stop only for:
  - a secret or key missing from `.env.local`;
  - an action that needs Filippo's accounts (Vercel, the Supabase dashboard, the Anthropic console);
  - anything destructive to the database or to the `main` branch.
- When blocked on one of these, write what is needed in `NEXT_STEPS_FOR_FILIPPO.md`, push it, and continue with every task that does not depend on it.
- After each finished stage, append a five-line summary to `NEXT_STEPS_FOR_FILIPPO.md`, with the preview URL if there is one.

Checkpoints (a usage limit can stop a session at any moment):

- Before starting a task, write it under "Now working on" in `PROGRESS.md`, with the branch and, if a sub-agent has it, the worktree.
- During a task longer than about 20 minutes, make WIP commits (`WIP: <task>`) on the stage branch and push them.
- After every finished task: tick it, clear "Now working on", commit, push.
- At the start of every session: run `git status` and `git worktree list`, read "Now working on" in `PROGRESS.md`, finish or clean up any half-done work and leftover worktrees first, then continue.
- Keep `PROGRESS.md` accurate at all times, so a new session can continue from it alone.

Git:

- Each stage is built on its own branch, named `stage-<n>-<short-name>` (e.g. `stage-3-sales-import`), created from an up-to-date `main`.
- A stage has many pushes to its branch, one per finished task. Never push stage work straight to `main`.
- When every task in the stage is ticked and its done check passes on the branch, the main agent reviews the whole stage: tests, type check, lint, the done check, the rules in this file, and code quality. Anything it finds is fixed on the stage branch.
- Only after that review passes does the main agent merge the stage branch into `main` and push. The next stage then starts on a new branch from the updated `main`.
- Never add Co-Authored-By, "Generated with Claude Code" or any other AI attribution to commits or PR descriptions.

## Framework notes (Next.js 16)

This is not the Next.js of older tutorials. `AGENTS.md` says the same: read the guide in `node_modules/next/dist/docs/` before using an API you are not sure about.

- **Cache Components are on** (`cacheComponents: true`). A component that reads the session, cookies, `params`, `searchParams` or the database must sit inside `<Suspense>`. Reading them outside a boundary is a build error.
- **Page shape.** `page.tsx` exports a plain, non-async component: the static title plus `<Suspense fallback={<skeleton>}>` around an async content component that loads the data. Do not `await` the session at the top of a layout.
- **Middleware is `proxy.ts`** at the project root, exporting `proxy`. It only refreshes the session and redirects signed-out visitors. Real authorisation is checked again in every Server Action and data function.
- **Mutations are Server Actions** (`"use server"`), validated with Zod, re-reading the user and role on the server. After a write, call `refresh()` or `revalidatePath()` so the screen shows the new data.
- **Types.** `PageProps<"/route">` and `LayoutProps<"/route">` are global helpers generated by `next typegen`, which `npm run typecheck` runs first. `params` and `searchParams` are promises.
- **shadcn/ui** is the Radix base, Nova preset. Forms use the `field` components (`components/ui/field.tsx`); there is no `form` component.

## How the rules apply in code

- **Ledger.** All writes to `stock_movements` go through `lib/ledger`. Nothing else inserts into that table. The only delete is the import-undo database function. See `SCHEMA.md`, "Ledger rules".
- **RLS.** App queries use `lib/db/client.ts`, which runs each transaction as the database role `app_user` with the signed-in user's id set, so policies apply. Policies are written `to: appUser` and use `public.is_member()`, `public.has_role()` and `public.current_user_id()`. Every migration that adds a table ends with hand-written `GRANT`s to `app_user` (Drizzle does not generate grants). `lib/db/admin.ts` bypasses RLS and is imported only by migrations, the seed script and the sign-up bootstrap.
- **Supabase client.** `supabase-js` is for Auth and Storage only. Never query tables with it: new tables are not exposed to the Data API, and all table access goes through Drizzle on the server.
- **Tenant keys.** Parents have `UNIQUE(id, location_id)` and children use composite foreign keys, so a row can never reference another location's data. See `SCHEMA.md`, "Composite tenant keys".
- **AI.** `lib/ai` uses `client.messages.parse()` with `zodOutputFormat()` so every result is validated against a Zod schema. Check `stop_reason` and a null `parsed_output` before using a result. Every result is saved as a draft in `ai_extractions`; nothing reaches the ledger until a user confirms. Use the `claude-api` skill when building this module.
- **Counts.** A count changes the ledger only when a manager or owner approves it.
- **Stages.** Work one stage at a time from `PROGRESS.md`. Do not start a stage until the previous one passes its done check.
- **Database connections.** `lib/db/client.ts` and `lib/db/admin.ts` connect through `DATABASE_URL` with `prepare: false`. `drizzle.config.ts` and `scripts/seed.ts` use `DATABASE_URL_MIGRATIONS`.
- **Open design questions.** If something is not answered in `SPEC.md`, `SCHEMA.md` or `DECISIONS.md`, choose the option most consistent with them, record it in `DECISIONS.md`, and continue. See "Autonomy" for the few cases where the main agent stops.
