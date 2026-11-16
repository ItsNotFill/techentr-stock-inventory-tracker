# Next steps for Filippo

Things only you can do, newest need first. Stage summaries are at the bottom.

## Waiting on you

### 1. Create the Vercel project (about 5 minutes)

Stage 0 is finished except for this. The app is on `main` and builds.

1. Go to <https://vercel.com> and log in with the GitHub account that owns the repository.
2. Click **Add New…** (top right), then **Project**.
3. Under **Import Git Repository**, find `ItsNotFill/techentr-stock-inventory-tracker` and click **Import**.
   - If it is not in the list, click **Adjust GitHub App Permissions**, give Vercel access to that repository, and come back.
4. Leave everything as detected: **Framework Preset** Next.js, **Root Directory** `./`, build and output settings untouched.
5. Open **Environment Variables** and add the names below. Copy each value from your `.env.local`. Leave the environment selector on all three (Production, Preview, Development).
   - Shortcut: copy the whole content of `.env.local` and paste it into the first **Key** box. Vercel fills in every row. Then delete the `DATABASE_URL_MIGRATIONS` row and the empty `ANTHROPIC_API_KEY` row.
6. Click **Deploy** and wait for it to finish (one to two minutes).
7. Click the screenshot of the site. You should see a page that says "Restaurant Inventory". That is the stage 0 done check.
8. Paste the public URL under "Answers" at the bottom of this section, commit and push, or tell me the URL in the next session.

Environment variables to add in Vercel:

| Name | Add now? |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes |
| `SUPABASE_SECRET_KEY` | yes |
| `DATABASE_URL` | yes (the port 6543 one) |
| `AI_MODEL` | yes (`claude-sonnet-5-5`) |
| `ANTHROPIC_API_KEY` | later, when you have the key (see below) |
| `DATABASE_URL_MIGRATIONS` | no. Migrations and the seed run from your computer, not from Vercel |

After this, every push to a branch gets its own preview URL. You find it in Vercel under **Deployments**, or on GitHub next to the commit (the green tick, then **Details**).

**Answers**

- Public URL: _(paste here)_

### 2. Tell Supabase where the app lives (2 minutes, after step 1)

Sign-up sends a confirmation e-mail, and the link in it must point at the app.

1. Open the Supabase dashboard, your project, then **Authentication** in the left menu, then **URL Configuration**.
2. **Site URL**: put the Vercel URL from step 1, for example `https://your-project.vercel.app`.
3. **Redirect URLs**: click **Add URL** and add these two, one at a time:
   - `http://localhost:3000/**`
   - `https://your-project.vercel.app/**` (your real Vercel URL, with `/**` at the end)
4. Click **Save**.

Good to know:

- Supabase's built-in e-mail sender allows only a few e-mails per hour. That is enough to try sign-up, not for a pilot. For the pilot, set up your own SMTP sender under **Authentication**, **Emails**, **SMTP Settings**.
- You can try the app without any of this: the seed data has three ready-made accounts that need no e-mail (see "Try it" below).

### 3. Create a Claude API key (5 minutes)

The AI tasks read photos (POS screenshots, end-of-day reports, supplier invoices) with the Claude API. `ANTHROPIC_API_KEY` in `.env.local` is empty, so those tasks are parked and everything else continues.

1. Go to <https://console.anthropic.com> and log in (or create an account).
2. Open **Settings**, then **Billing**, and add a small amount of credit (5 euros is plenty for building and testing: one photo costs cents).
3. Open **API keys**, click **Create Key**, name it `restaurant-inventory`, and copy the key. It starts with `sk-ant-` and is shown only once.
4. Open `.env.local` in the project folder and paste the key after `ANTHROPIC_API_KEY=` on that line. Save. Do not put it anywhere else in the project.
5. In Vercel (once the project from step 1 exists): **Settings**, **Environment Variables**, add `ANTHROPIC_API_KEY` with the same value, then redeploy.
6. Start a new session and say the key is there. The parked tasks are listed in `PROGRESS.md` under "AI onboarding", "Sales by photo" and "Restock by invoice photo".

## Try it

The database already holds the demo restaurant "Pizzeria Demo" with 16 ingredients.

1. In the project folder run `npm run dev` and open <http://localhost:3000>.
2. Log in as `owner@pizzeria-demo.example.com`, `manager@pizzeria-demo.example.com` or `staff@pizzeria-demo.example.com`.
3. The password (one for all three) is in the file `.env.seed.local` in the project folder. That file is not committed.

`npm run db:seed` can be run again at any time. It updates the demo restaurant and never deletes anything.

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
