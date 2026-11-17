# Next steps for Filippo

Things only you can do, newest need first. Stage summaries are at the bottom.

## Waiting on you

### 1. Create a Claude API key (5 minutes)

The AI tasks read photos (POS screenshots, end-of-day reports, supplier invoices) with the Claude API. `ANTHROPIC_API_KEY` in `.env.local` is empty, so those tasks are parked and everything else continues.

1. Go to <https://console.anthropic.com> and log in (or create an account).
2. Open **Settings**, then **Billing**, and add a small amount of credit (5 euros is plenty for building and testing: one photo costs cents).
3. Open **API keys**, click **Create Key**, name it `restaurant-inventory`, and copy the key. It starts with `sk-ant-` and is shown only once.
4. Open `.env.local` in the project folder and paste the key after `ANTHROPIC_API_KEY=` on that line. Save. Do not put it anywhere else in the project.
5. In Vercel: **Settings**, **Environment Variables**, add `ANTHROPIC_API_KEY` with the same value (Production ticked), then redeploy with "Use existing Build Cache" unticked.
6. Start a new session and say the key is there. The parked tasks are listed in `PROGRESS.md` under "AI onboarding", "Sales by photo" and "Restock by invoice photo".

## Done

- **Vercel project** (17 Nov): live at <https://techentr-stock-inventory-tracker.vercel.app/>, deploying `main` automatically. Every pushed branch gets a preview URL.
- **Supabase URL configuration** (17 Nov): Site URL is the Vercel URL; Redirect URLs are `https://techentr-stock-inventory-tracker.vercel.app/**` and `http://localhost:3000/**`.
- **Supabase address fixed** (17 Nov): `NEXT_PUBLIC_SUPABASE_URL` ends in `.supabase.co` in `.env.local` and in Vercel. Checked: the demo owner logs in locally and on the live site, and all five browser tests pass against the live site. <https://techentr-stock-inventory-tracker.vercel.app/api/health> shows the live commit and whether Supabase is reachable.
- Good to know: Supabase's built-in e-mail sender allows only a few e-mails per hour. Enough to try sign-up, not for a pilot: set up your own SMTP sender under **Authentication** → **Emails** → **SMTP Settings** before then. Team invites do not need e-mail (they are links).

## Try it

The database already holds the demo restaurant "Pizzeria Demo" with 16 ingredients.

1. In the project folder run `npm run dev` and open <http://localhost:3000>.
2. Log in as `owner@pizzeria-demo.example.com`, `manager@pizzeria-demo.example.com` or `staff@pizzeria-demo.example.com`.
3. The password (one for all three) is in the file `.env.seed.local` in the project folder. That file is not committed.

`npm run db:seed` can be run again at any time. It updates the demo restaurant and never deletes anything.

The demo restaurant already holds the worked example from the spec: opening stock, a mozzarella delivery and one day of sales (16 November 2026). To try the import screen yourself, upload `scripts/seed/sample-sales-day2.csv` under **Import sales**. Upload it a second time to see that nothing is imported twice, and use **Undo** in the history to take it back.

## Stage summaries

### Stage 0: Setup (2026-11-16)

- Built: Next.js 16 app with Tailwind and shadcn/ui, Vitest, Supabase clients, Drizzle with the first migration (`setup_check` test table, RLS on).
- Checked: typecheck, lint, tests and build pass; both database URLs connect (`npm run db:check`); the reviewer agent returned OK.
- Not done: the Vercel project. It needs your account; the steps are in section 1 above. The "live at a public URL" half of the done check waits for it.
- Good to know: Next.js 16 works differently from older versions (see "Framework notes" in `CLAUDE.md`); decisions 37 to 42 in `DECISIONS.md` record what was chosen.
- Preview URL: none yet. Once the Vercel project exists, every branch push gets one.

### Stage 1: Auth and ingredients (2026-11-16)

- Built: sign-up, login, first-login onboarding, three roles, the signed-in shell (works on a phone), ingredients with pack sizes, settings and team, and the demo data (`npm run db:seed`).
- Done check passes: a second restaurant cannot read or change the first one's ingredients (`tests/integration/ingredients-isolation.test.ts`, 44 tests in total, run against the real database).
- The reviewer agent found an open redirect in the e-mail link route; it is fixed and tested. It returned OK after that.
- Different from the plan: the app uses its own database role (`app_user`), and team invites are one-time links you pass on, not e-mails. Reasons are in `DECISIONS.md`, entries 43 and 49.
- Preview URL: none until the Vercel project exists (section 1). Not yet checked by a person in a browser or on a phone: please click through it once (see "Try it").

### Stage 2: Menu and recipes, manual path (2026-11-16)

- Built: menu items (with modifiers and "ignored" for things that use no stock), the recipe editor with live ingredient cost, and the demo menu: 14 items, each with a recipe or ignored (`npm run db:seed`).
- Done check passes: a pizzeria menu can be entered with a recipe for every item. Checked by 60 tests against the real database and by a headless browser that clicks through the screens (`npm run test:e2e`). The reviewer agent returned OK.
- The browser test found and fixed two bugs in every form: typed values were wiped after a failed save, and fields could attach to a hidden copy of an earlier screen.
- Not done: the AI onboarding tasks (menu from POS screenshots, draft recipes). They need the Claude API key (section 3) and are parked in `PROGRESS.md`.
- Preview URL: none until the Vercel project exists (section 1). A person has still not clicked through the app: please try the menu and a recipe once (see "Try it").

### Stage 3: Sales import and depletion, manual path (2026-11-17)

- Built: the stock ledger (append-only, enforced in the database), depletion of sales through recipes, CSV import with column mapping, preview and row errors, the "Needs recipe" queue with back-fill, undo, import history, and an "In stock" column on the ingredients list.
- Done check passes: the same CSV uploaded twice changes stock once, and the worked example gives 2,600 g of mozzarella. Checked by 112 tests against the real database and by a browser test of the whole import flow. The reviewer agent returned OK; its hardening notes were applied.
- Demo data: the worked example's day (opening stock, delivery, 18 orders) is in the database; `scripts/seed/sample-sales-day2.csv` is there to try the import screen.
- Not done: "Sales by photo" (needs the Claude API key).
- Live URL: <https://techentr-stock-inventory-tracker.vercel.app/>. Login there waits for the Supabase address fix (section 0).

### Stage 4: Stock count and unexplained usage, manual path (2026-11-17)

- Built: the count screen for phones (grouped by storage area, by pack or by kg/l, saves as you go), submit, the manager's review with approve or reject, the unexplained usage report, and the late-movement rule (sales or deliveries recorded after a count keep that count right).
- Done check passes: the demo's closing count shows mozzarella −500 g and −€4.00. Checked by 133 tests against the real database and five browser tests (including staff counting on a phone and an owner approving).
- The reviewer agent found three ways the numbers could be wrong or forged; all fixed and tested before the merge.
- Not done: offline counting (stage 4's last block), and nothing of stage 5 yet (deliveries, waste, dashboard, PWA).
- Live: <https://techentr-stock-inventory-tracker.vercel.app/>; `/api/health` shows whether the live build reaches Supabase.
