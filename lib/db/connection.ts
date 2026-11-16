import "server-only";
import postgres from "postgres";
import { serverEnv } from "@/lib/env";

/**
 * The one postgres.js pool of the app. It connects through DATABASE_URL, the
 * transaction pooler, which does not support prepared statements: hence
 * `prepare: false`. The connecting role bypasses RLS, so this module is used
 * only by lib/db/client.ts (which drops to app_user) and lib/db/admin.ts.
 */
type Pool = ReturnType<typeof postgres>;

const globalForPool = globalThis as typeof globalThis & { __appPgPool?: Pool };

export function getPool(): Pool {
  // Kept on globalThis so that hot reloads in development reuse the pool.
  globalForPool.__appPgPool ??= postgres(serverEnv.databaseUrl, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
  });
  return globalForPool.__appPgPool;
}
