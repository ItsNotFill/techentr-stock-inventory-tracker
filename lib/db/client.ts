import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { requireUser } from "@/lib/auth/session";
import { getPool } from "./connection";
import { runAsUser, type Database, type Tx } from "./rls";
import * as schema from "./schema";

export type { Tx } from "./rls";

let db: Database | undefined;

function getDb(): Database {
  db ??= drizzle(getPool(), { schema });
  return db;
}

/**
 * The app's way to the database. Runs `fn` in one transaction as the signed-in
 * user, so RLS policies decide what it can read and write. Redirects to /login
 * when nobody is signed in.
 *
 *   const rows = await withUser((tx) => tx.select().from(ingredients));
 */
export async function withUser<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const user = await requireUser();
  return runAsUser(getDb(), user.id, fn);
}

/**
 * Same as `withUser`, for code that already holds the verified user id
 * (for example right after reading the session). Never pass an id that came
 * from the browser.
 */
export async function withUserId<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runAsUser(getDb(), userId, fn);
}
