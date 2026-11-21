import { sql } from "drizzle-orm";
import { boolean, index, pgPolicy, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt } from "./columns";
import { memberRole } from "./enums";
import { appUser } from "./roles";

// Policies are written as raw SQL with schema-qualified names. The helper
// functions public.is_member() and public.has_role() come from a hand-written
// migration. No policy for an operation means it is denied: organizations and
// locations are inserted only by the sign-up bootstrap (admin connection).
const ownerOnly = (locationColumn: string) =>
  sql.raw(`public.has_role(${locationColumn}, array['owner']::public.member_role[])`);

/** The paying customer: one owner, one or more locations. */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    plan: text("plan").notNull().default("pilot"),
    createdAt: createdAt(),
  },
  () => {
    const memberOfALocation = sql`exists (select 1 from public.locations l where l.org_id = organizations.id and public.is_member(l.id))`;
    const ownerOfALocation = sql`exists (select 1 from public.locations l where l.org_id = organizations.id and public.has_role(l.id, array['owner']::public.member_role[]))`;
    return [
      pgPolicy("organizations_select_member", { for: "select", to: appUser, using: memberOfALocation }),
      pgPolicy("organizations_update_owner", {
        for: "update",
        to: appUser,
        using: ownerOfALocation,
        withCheck: ownerOfALocation,
      }),
    ];
  },
);

/** One restaurant. Every other table hangs off a location. */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    posProvider: text("pos_provider"),
    /** IANA name, taken from the browser at sign-up. */
    timezone: text("timezone").notNull(),
    /** E-mails (stage 7, DECISIONS.md 99): the weekly owner summary and low-stock alerts, switched by owners. */
    weeklySummaryEnabled: boolean("weekly_summary_enabled").notNull().default(true),
    lowStockAlertsEnabled: boolean("low_stock_alerts_enabled").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("locations_org_id_idx").on(t.orgId),
    pgPolicy("locations_select_member", { for: "select", to: appUser, using: sql`public.is_member(id)` }),
    pgPolicy("locations_update_owner", {
      for: "update",
      to: appUser,
      using: ownerOnly("id"),
      withCheck: ownerOnly("id"),
    }),
  ],
);

/** Who can do what where. Users themselves live in Supabase Auth. */
export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.locationId] }),
    index("memberships_location_id_idx").on(t.locationId),
    pgPolicy("memberships_select_member", {
      for: "select",
      to: appUser,
      using: sql`public.is_member(location_id)`,
    }),
    pgPolicy("memberships_insert_owner", { for: "insert", to: appUser, withCheck: ownerOnly("location_id") }),
    pgPolicy("memberships_update_owner", {
      for: "update",
      to: appUser,
      using: ownerOnly("location_id"),
      withCheck: ownerOnly("location_id"),
    }),
    pgPolicy("memberships_delete_owner", { for: "delete", to: appUser, using: ownerOnly("location_id") }),
  ],
);
