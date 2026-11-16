/**
 * Smoke test over HTTP against a running server (default http://localhost:3000):
 * signed-out redirect, sign-in, onboarding redirect, dashboard after bootstrap.
 * Creates a throwaway user and restaurant and removes them again.
 *
 *   npm run dev            (in another terminal)
 *   npx tsx scripts/smoke-auth.ts [base-url]
 */
import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createRestaurantForUser } from "../lib/auth/bootstrap";
import * as schema from "../lib/db/schema";

config({ path: ".env.local", quiet: true });

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures += 1;
}

async function get(path: string, cookie = "") {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

async function main() {
  const admin = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pool = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const db = drizzle(pool, { schema });

  const email = `test-smoke-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`Could not create the smoke user: ${error?.message}`);
  const userId = created.user.id;
  let restaurant: { organizationId: string | null; locationId: string } | undefined;

  try {
    // Sign in the way the server does, and keep the cookies it would set.
    const jar = new Map<string, string>();
    const supabase = createServerClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
      },
    });
    const signIn = await supabase.auth.signInWithPassword({ email, password });
    if (signIn.error) throw new Error(`Sign-in failed: ${signIn.error.message}`);
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");

    const home = await get("/");
    check("landing page is public", home.status === 200 && home.body.includes("Restaurant Inventory"));

    const signedOut = await get("/dashboard");
    check("signed-out /dashboard redirects to /login", signedOut.status === 307 && signedOut.location.endsWith("/login"), `${signedOut.status} ${signedOut.location}`);

    const loginWhileSignedIn = await get("/login", cookie);
    check("signed-in /login redirects to /dashboard", loginWhileSignedIn.status === 307 && loginWhileSignedIn.location.endsWith("/dashboard"), `${loginWhileSignedIn.status} ${loginWhileSignedIn.location}`);

    const beforeOnboarding = await get("/dashboard", cookie);
    check("no restaurant yet: /dashboard sends the user to /onboarding", beforeOnboarding.body.includes("/onboarding"), `${beforeOnboarding.status}`);

    const onboarding = await get("/onboarding", cookie);
    check("onboarding page renders the form", onboarding.status === 200 && onboarding.body.includes("restaurantName"));

    const name = `Smoke Pizzeria ${randomUUID().slice(0, 8)}`;
    restaurant = await createRestaurantForUser(db, { userId, restaurantName: name, timezone: "Europe/Amsterdam" });

    const dashboard = await get("/dashboard", cookie);
    check("dashboard shows the restaurant", dashboard.status === 200 && dashboard.body.includes(name), `${dashboard.status}`);
    check("dashboard shows the owner role", dashboard.body.includes("Owner"));

    for (const path of process.argv.slice(3)) {
      const page = await get(path, cookie);
      check(`${path} renders for the owner`, page.status === 200 && !page.body.includes("Application error"), `${page.status}`);
    }
  } finally {
    if (restaurant) {
      await db.delete(schema.locations).where(eq(schema.locations.id, restaurant.locationId));
      if (restaurant.organizationId) {
        await db.delete(schema.organizations).where(eq(schema.organizations.id, restaurant.organizationId));
      }
    }
    await admin.auth.admin.deleteUser(userId);
    await pool.end();
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
