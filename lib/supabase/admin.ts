import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";
import { supabasePublicEnv } from "./public-env";

/**
 * Supabase client with the secret key, for Auth admin calls only (inviting a
 * user). Server only. Like the other Supabase clients it never queries tables.
 */
export function createSupabaseAdminClient() {
  const { url } = supabasePublicEnv();
  return createClient(url, serverEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
