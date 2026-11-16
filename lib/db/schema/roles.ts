import { pgRole } from "drizzle-orm/pg-core";

/**
 * The role the app runs its queries as (see lib/db/client.ts). It is created
 * by a hand-written migration, so Drizzle must treat it as existing.
 * Every RLS policy is written `to: appUser`.
 */
export const appUser = pgRole("app_user").existing();
