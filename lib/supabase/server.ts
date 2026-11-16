import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { supabasePublicEnv } from "./public-env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * It reads the session from the request cookies. Auth and Storage only:
 * tables are never queried with supabase-js (see CLAUDE.md).
 */
export async function createSupabaseServerClient() {
  // The Supabase client reads the clock while it is built. With Cache
  // Components that must not happen during a prerender, so wait for a real
  // request first.
  await connection();
  const { url, publishableKey } = supabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The session is refreshed
          // in proxy.ts, so this is safe to ignore there.
        }
      },
    },
  });
}
