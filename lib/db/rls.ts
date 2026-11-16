import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import type * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

/** A transaction handle. Functions in lib/ that touch the database take one of these. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const userIdSchema = z.uuid();

/**
 * Runs `fn` in one transaction as the database role `app_user`, with the given
 * user's id in `request.jwt.claims`, so that every RLS policy applies to it.
 * Both settings are local to the transaction, which is what makes this safe on
 * a pooled connection. See DECISIONS.md, entry 43.
 */
export async function runAsUser<T>(db: Database, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const sub = userIdSchema.parse(userId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub })}, true)`);
    await tx.execute(sql`set local role app_user`);
    return fn(tx);
  });
}
