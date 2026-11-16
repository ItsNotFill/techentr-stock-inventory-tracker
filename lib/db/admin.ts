import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import { getPool } from "./connection";
import type { Database } from "./rls";
import * as schema from "./schema";

let db: Database | undefined;

/**
 * Admin connection: BYPASSES ROW LEVEL SECURITY.
 *
 * Import this only from the sign-up bootstrap (creating a user's first
 * organization, location and owner membership). Migrations and the seed script
 * make their own connection through DATABASE_URL_MIGRATIONS. Everything else
 * uses `withUser` from lib/db/client.ts.
 */
export function getAdminDb(): Database {
  db ??= drizzle(getPool(), { schema });
  return db;
}
