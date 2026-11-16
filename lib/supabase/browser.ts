import { createBrowserClient } from "@supabase/ssr";
import { supabasePublicEnv } from "./public-env";

/**
 * Supabase client for Client Components. Auth and Storage only:
 * tables are never queried with supabase-js (see CLAUDE.md).
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = supabasePublicEnv();
  return createBrowserClient(url, publishableKey);
}
