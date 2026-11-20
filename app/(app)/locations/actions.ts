"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { createLocation, LocationError, LOCATION_COOKIE } from "@/lib/auth/locations";
import { checkRole, getMyLocations } from "@/lib/auth/membership";
import { OWNER_ROLES } from "@/lib/auth/roles";
import { getCurrentUser } from "@/lib/auth/session";
import { withUser } from "@/lib/db/client";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { locationFormSchema } from "@/lib/validation/locations";

// Server Actions for working in several locations (DECISIONS.md 98). The
// cookie only says which of the user's own locations they chose; every
// request checks it again (lib/auth/membership.ts) and RLS checks every row.

const ONE_YEAR = 60 * 60 * 24 * 365;

async function rememberLocation(locationId: string) {
  (await cookies()).set(LOCATION_COOKIE, locationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/** Switches to another of the user's locations. The screen then goes to the dashboard. */
export async function switchLocationAction(locationId: string): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return PERMISSION_DENIED;
  const parsed = idSchema.safeParse(locationId);
  if (!parsed.success) return formError("This location no longer exists.");
  const location = (await getMyLocations()).find((candidate) => candidate.locationId === parsed.data);
  if (!location) return formError("You are not part of that location.");
  await rememberLocation(location.locationId);
  refresh();
  return { ok: true, message: `Now working in ${location.locationName}.` };
}

/**
 * An owner adds a location to their organization (`{ name, timezone }`); they
 * become its owner and start working in it.
 */
export async function addLocationAction(values: unknown): Promise<FormState & { id?: string }> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const parsed = locationFormSchema.safeParse(values);
  if (!parsed.success) return invalidForm(parsed.error);
  try {
    const id = await withUser((tx) => createLocation(tx, membership.organizationId, parsed.data.name, parsed.data.timezone));
    await rememberLocation(id);
    refresh();
    return { ok: true, id, message: `${parsed.data.name} added. You are now working in it.` };
  } catch (error) {
    if (error instanceof LocationError) {
      return error.field
        ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
        : formError(error.message);
    }
    throw error;
  }
}
