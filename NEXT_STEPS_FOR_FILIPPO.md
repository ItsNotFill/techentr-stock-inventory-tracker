# Next steps for Filippo

## For teammates

**Live app:** <https://techentr-stock-inventory-tracker.vercel.app>

The app turns a restaurant's sales into the ingredients they should have used, compares that with what staff count on the shelf, and shows the gap in grams and euros as "unexplained usage".

**Demo logins** (restaurant "Pizzeria Demo"). The password is the same for all three; Filippo shares it separately.

| Role | E-mail | Sees |
| --- | --- | --- |
| Owner | `owner@pizzeria-demo.example.com` | everything, including settings and team |
| Manager | `manager@pizzeria-demo.example.com` | ingredients, menu, imports, counts, unexplained usage |
| Staff | `staff@pizzeria-demo.example.com` | counting only; best on a phone |

Everyone shares the same demo restaurant, so what you change, others see. Undo an import when you are done, and reject a test count instead of approving it.

**A short tour** (log in as owner or manager; a new restaurant's Dashboard lists the first six steps):

1. **Ingredients.** Everything the pizzeria buys, with cost per kg or unit, pack sizes (a 1 kg bag, a 25 kg sack) and a reorder point. Open Mozzarella to see the details.
2. **Menu and recipe.** Open **Menu**, then **Margherita**: its recipe says one pizza uses 120 g of mozzarella, 160 g of flour and so on, and shows the ingredient cost per pizza (€1.41).
3. **Import sales.** Open **Import sales**. The history shows the day already imported from the till's CSV export. To try it yourself, upload `sample-sales-day2.csv` (Filippo sends it with the password): pick the file, check the columns, import. Upload it again and nothing is imported twice. **Undo** in the history takes it back out.
4. **Stock.** Back on **Ingredients**, the "In stock" column is what should be on the shelf after deliveries, sales and waste. Mozzarella shows **Low**: it is under its reorder point.
5. **Count.** Log in as staff (on a phone if you can), open **Count**, **Start a count** and type what is on the shelf, by pack or by kg. Each figure saves when you leave the field; **Submit count** at the bottom. Then log in as manager: the count waits under **Count** for approval. Reject it with a note so the demo numbers stay as they are.
6. **Unexplained usage.** Open **Unexplained usage**, then the count of 16 Nov. Mozzarella should have been 2,400 g, the count found 1,900 g: **−500 g, −€4.00** that no sale, delivery or waste explains. That gap, per ingredient and in euros, is the product.
7. **Deliveries and waste (staff, on a phone).** As staff, **Deliveries**: pick an ingredient, the pack ("Bag 1 kg") and how many, **Log delivery**; stock goes up at once. **Waste** works the same way with a reason (expired, dropped, burnt). Both show in an ingredient's **Stock history** (owners and managers: Ingredients, open one, **Stock history**), with the stock after every movement.
8. **Dashboard and the app on your phone.** The dashboard shows what is low, the last import and the last count's unexplained usage with the five biggest losses. On a phone, "Install app" (Android) or "Add to Home Screen" (iPhone) puts **Inventory** on the home screen; screens you opened before still open without signal.

## Waiting on you

Things only you can do, newest need first. Stage summaries are at the bottom.

### 1. Install the app on a phone and log a delivery (10 minutes): the stage 5 done check

Stage 5's done check is "a staff member can log a delivery from a phone home-screen icon". Everything up to the phone is checked automatically: Chrome reports nothing that stops the install, the app opens offline, and a staff member logs a delivery on a phone-sized screen. Only a real phone is missing.

1. On the phone, open <https://techentr-stock-inventory-tracker.vercel.app> (the live site has stage 5 once it is merged; until then use the branch's preview link from the Vercel dashboard, project "techentr-stock-inventory-tracker", branch `stage-5-deliveries-pwa`).
2. Install it:
   - **Android (Chrome):** menu (⋮), then **Install app** (or **Add to Home screen**).
   - **iPhone (Safari):** Share button, then **Add to Home Screen**, then **Add**.
3. Close the browser. Open **Inventory** from the home screen. It should open full screen, without the browser's address bar.
4. Log in as `staff@pizzeria-demo.example.com` (password in `.env.seed.local`).
5. Tap **Deliveries**, pick **Mozzarella**, keep "Bag 1 kg", type **1**, tap **Log delivery**. You should see "Delivery logged: 1 item added to stock." and the delivery under "Recent deliveries".
6. So the demo numbers stay the same: tap **Waste**, pick Mozzarella, **1** × Bag 1 kg, reason **Other**, note "install test", **Log waste**.
7. Optional: switch on airplane mode and open the app again from the icon. Screens you opened before still show; a screen you never opened shows "No connection".
8. Tell the next session it worked (or what went wrong). It then ticks "Install on a real phone" in `PROGRESS.md`.

**Good to know about the demo restaurant:** a count of three drinks (house red wine, cola, beer) was submitted and approved by the demo owner on 18 Nov at 12:50, probably while you tried the app. It is now the newest count, so the dashboard shows **+€753.40** for "Unexplained usage, last count" instead of the worked example's −€4.00 (cola: 1,080 cans counted against 87 expected). The −€4.00 is still there under **Unexplained usage**, count of 16 Nov. Approved counts cannot be changed. If you want the dashboard to show the worked example again for a demo, say so: a new count of those three drinks at their real levels can be entered and approved, and it then becomes the newest count.

### 2. Create a Claude API key (5 minutes)

The AI tasks read photos (POS screenshots, end-of-day reports, supplier invoices) with the Claude API. `ANTHROPIC_API_KEY` in `.env.local` is empty, so those tasks are parked and everything else continues.

1. Go to <https://console.anthropic.com> and log in (or create an account).
2. Open **Settings**, then **Billing**, and add a small amount of credit (5 euros is plenty for building and testing: one photo costs cents).
3. Open **API keys**, click **Create Key**, name it `restaurant-inventory`, and copy the key. It starts with `sk-ant-` and is shown only once.
4. Open `.env.local` in the project folder and paste the key after `ANTHROPIC_API_KEY=` on that line. Save. Do not put it anywhere else in the project.
5. In Vercel: **Settings**, **Environment Variables**, add `ANTHROPIC_API_KEY` with the same value (Production ticked), then redeploy with "Use existing Build Cache" unticked.
6. Start a new session and say the key is there. The parked tasks are listed in `PROGRESS.md` under "AI onboarding", "Sales by photo" and "Restock by invoice photo".

## Done

- **Project moved out of iCloud Drive** (17 Nov): it now lives in `~/Development/Project_Tech_Entre`. `.gitignore` ignores iCloud conflict copies ("file 2.tsx", "page 3.tsx", ...).
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

### UI design pass: Basil kitchen theme (2026-11-17)

- Built: one theme for every screen (green `#2E7D4F` on warm white, dark green sidebar, Geist font), page titles with a one-line description and the main action top right, shaded tables with right-aligned numbers and units, red only for losses, coloured status badges, empty states with a button, compact figures on a phone, and a "Get started" dashboard that doubles as the demo tour.
- Fixed on the way: on the count screen, a figure typed while the previous one was still saving was not saved (now queued and saved); the stage 4 browser test now waits for the real "Saved" status.
- Checked: 138 tests, five browser tests, type check, lint and build pass; the reviewer agent returned OK. Before and after screenshots of every screen, desktop and phone: `docs/screenshots/before` and `docs/screenshots/after`.
- Rules for later screens: "Design rules" in `CLAUDE.md`; the palette and reasons in `DECISIONS.md`, entries 73 to 81.
- Live: <https://techentr-stock-inventory-tracker.vercel.app>. Open point: input borders (`#D9D4C7`) are 1.5:1 against white, below the 3:1 WCAG asks for form fields; say if you want them darker.

### Stage 5: Deliveries, waste, dashboard, PWA (2026-11-18)

- Built: Log delivery and Log waste for phones (by pack or by kg; a retried tap is saved once), the real dashboard (low stock, last import, last count's unexplained usage, top five chart), Stock history per ingredient, and the installable app (manifest, icons, a service worker: screens opened before work offline).
- Done check: Chrome finds nothing that stops the install, and a staff member logs a delivery on a phone-sized screen (179 tests, nine new browser tests). The real phone is yours: section 1.
- The reviewer agent returned OK; its four small notes are fixed or written down (DECISIONS.md, entry 90).
- Good to know: `npm run build` now also builds the service worker (Serwist); the demo dashboard shows +€753.40 because of today's drinks count (section 1). Offline counting is next for the agents.
- Live: <https://techentr-stock-inventory-tracker.vercel.app> once Vercel has deployed `main`; the branch preview is in the Vercel dashboard.
