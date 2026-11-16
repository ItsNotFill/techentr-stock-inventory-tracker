import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createRestaurantForUser } from "@/lib/auth/bootstrap";
import type { Database } from "@/lib/db/rls";
import * as schema from "@/lib/db/schema";
import type { MemberRole } from "@/lib/db/schema";

/** Integration tests need the database and the Supabase secret key. */
export const hasDatabase = Boolean(
  process.env.DATABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);

export type TestDb = { db: Database; close: () => Promise<void> };

/** An admin (RLS-bypassing) connection for arranging and cleaning up test data. */
export function createTestDb(): TestDb {
  const pool = postgres(process.env.DATABASE_URL!, { prepare: false, max: 2, onnotice: () => {} });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type TestUser = { id: string; email: string };

/** Creates a confirmed Supabase Auth user with a throwaway address. No e-mail is sent. */
export async function createTestUser(label: string): Promise<TestUser> {
  const email = `test-${label}-${randomUUID()}@example.com`;
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Could not create test user: ${error?.message}`);
  }
  return { id: data.user.id, email };
}

export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  await supabaseAdmin().auth.admin.deleteUser(user.id);
}

export type TestRestaurant = { organizationId: string; locationId: string };

/** A restaurant owned by `owner`, made the same way the sign-up bootstrap makes one. */
export async function createTestRestaurant(db: Database, owner: TestUser, name: string): Promise<TestRestaurant> {
  const result = await createRestaurantForUser(db, {
    userId: owner.id,
    restaurantName: `${name} ${randomUUID().slice(0, 8)}`,
    timezone: "Europe/Amsterdam",
  });
  if (!result.created || !result.organizationId) {
    throw new Error("Test user already had a restaurant");
  }
  return { organizationId: result.organizationId, locationId: result.locationId };
}

export async function addTestMember(db: Database, restaurant: TestRestaurant, user: TestUser, role: MemberRole) {
  await db.insert(schema.memberships).values({ userId: user.id, locationId: restaurant.locationId, role });
}

/** Removes test restaurants and everything stored under them. */
export async function deleteTestRestaurants(db: Database, restaurants: (TestRestaurant | undefined)[]) {
  const existing = restaurants.filter((r): r is TestRestaurant => Boolean(r));
  if (existing.length === 0) return;
  const locationIds = existing.map((r) => r.locationId);
  // Menu items go first: recipe lines hold a RESTRICT key on ingredients, which
  // would stop the cascade from the location.
  await db.delete(schema.menuItems).where(inArray(schema.menuItems.locationId, locationIds));
  await db.delete(schema.locations).where(inArray(schema.locations.id, locationIds));
  for (const restaurant of existing) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, restaurant.organizationId));
  }
}
