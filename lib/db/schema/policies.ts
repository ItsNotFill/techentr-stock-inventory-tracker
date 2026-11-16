import { sql, type SQL } from "drizzle-orm";
import { pgPolicy } from "drizzle-orm/pg-core";
import type { MemberRole } from "./enums";
import { appUser } from "./roles";

// The policy shape every tenant table uses (SCHEMA.md, "Row Level Security").
// The expressions are raw SQL with schema-qualified names; the functions come
// from the hand-written migration 0002.

export const MANAGERS: readonly MemberRole[] = ["owner", "manager"];
export const ANY_MEMBER: readonly MemberRole[] = ["owner", "manager", "staff"];

const roleArray = (roles: readonly MemberRole[]) =>
  `array[${roles.map((role) => `'${role}'`).join(", ")}]::public.member_role[]`;

/** True when the signed-in user belongs to the row's location. */
export const isMember: SQL = sql.raw("public.is_member(location_id)");

/** True when the signed-in user has one of the roles at the row's location. */
export const hasRole = (roles: readonly MemberRole[]): SQL =>
  sql.raw(`public.has_role(location_id, ${roleArray(roles)})`);

/**
 * Select for every member; insert, update and delete for `writers`.
 * Remember the GRANTs to app_user at the end of the table's migration.
 */
export function tenantPolicies(table: string, writers: readonly MemberRole[] = MANAGERS) {
  return [
    pgPolicy(`${table}_select_member`, { for: "select", to: appUser, using: isMember }),
    pgPolicy(`${table}_insert_role`, { for: "insert", to: appUser, withCheck: hasRole(writers) }),
    pgPolicy(`${table}_update_role`, {
      for: "update",
      to: appUser,
      using: hasRole(writers),
      withCheck: hasRole(writers),
    }),
    pgPolicy(`${table}_delete_role`, { for: "delete", to: appUser, using: hasRole(writers) }),
  ];
}
