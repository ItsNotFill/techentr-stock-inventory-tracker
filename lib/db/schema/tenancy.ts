import { index, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { createdAt } from "./columns";
import { memberRole } from "./enums";

/** The paying customer: one owner, one or more locations. */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("pilot"),
  createdAt: createdAt(),
}).enableRLS();

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
    createdAt: createdAt(),
  },
  (t) => [index("locations_org_id_idx").on(t.orgId)],
).enableRLS();

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
  ],
).enableRLS();
