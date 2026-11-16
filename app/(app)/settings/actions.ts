"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { checkRole } from "@/lib/auth/membership";
import { OWNER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  addMember,
  changeMemberRole,
  findUserIdByEmail,
  listTeam,
  removeMember,
  TeamError,
  updateRestaurantDetails,
} from "@/lib/team";
import { formError, invalidForm, PERMISSION_DENIED, type FormState } from "@/lib/validation/form";
import { idSchema } from "@/lib/validation/ingredients";
import { inviteMemberSchema, memberRoleSchema, restaurantDetailsSchema } from "@/lib/validation/team";

// Server Actions for the settings and team screen. Owner only: each action
// checks the role again, and RLS refuses the write for anyone else.

/** `link` is a one-time link the owner passes on to the new team member. */
export type InviteState = FormState & { link?: string; email?: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function toFormState(error: unknown): FormState {
  if (error instanceof TeamError) {
    return error.field
      ? { ok: false, message: "Please check the highlighted fields.", errors: { [error.field]: [error.message] } }
      : formError(error.message);
  }
  throw error;
}

/** A link that signs the person in once and takes them to "choose a password". */
async function accessLink(tokenHash: string, type: "invite" | "recovery"): Promise<string | undefined> {
  const requestHeaders = await headers();
  // Browsers send Origin with every Server Action; the host headers are the fallback.
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const origin =
    requestHeaders.get("origin") ?? (host ? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${host}` : null);
  if (!origin) return undefined;
  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/set-password");
  return url.toString();
}

export async function saveRestaurantDetails(_previous: FormState, formData: FormData): Promise<FormState> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;

  const parsed = restaurantDetailsSchema.safeParse({
    name: field(formData, "name"),
    posProvider: field(formData, "posProvider"),
    timezone: field(formData, "timezone"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  try {
    await withUser((tx) => updateRestaurantDetails(tx, membership.locationId, parsed.data));
    refresh();
    return { ok: true, message: "Restaurant details saved." };
  } catch (error) {
    return toFormState(error);
  }
}

/**
 * Adds someone to the team. A person who already has an account is added
 * straight away. Otherwise an account is created and the action returns a
 * one-time link for the owner to pass on (DECISIONS.md, entry 49).
 */
export async function inviteMember(_previous: InviteState, formData: FormData): Promise<InviteState> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;

  const parsed = inviteMemberSchema.safeParse({ email: field(formData, "email"), role: field(formData, "role") });
  if (!parsed.success) return invalidForm(parsed.error);
  const { email, role } = parsed.data;

  try {
    const existingUserId = await withUser((tx) => findUserIdByEmail(tx, membership.locationId, email));
    if (existingUserId) {
      await withUser((tx) => addMember(tx, membership.locationId, existingUserId, role));
      refresh();
      return { ok: true, email, message: `${email} already had an account and is now on the team. They can log in as usual.` };
    }

    const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({ type: "invite", email });
    if (error || !data.user) {
      return formError("Could not create the account. Check the e-mail address and try again.");
    }
    await withUser((tx) => addMember(tx, membership.locationId, data.user.id, role));
    refresh();
    const link = await accessLink(data.properties.hashed_token, "invite");
    return {
      ok: true,
      email,
      link,
      message: link
        ? `${email} is on the team. Send them the link below: it lets them choose a password. It works once and expires after a day.`
        : `${email} is on the team, but the link could not be made. Use "New login link" in the team list.`,
    };
  } catch (error) {
    return toFormState(error);
  }
}

/** A fresh one-time link for someone already on the team (lost link, forgotten password). */
export async function createMemberLink(userId: string): Promise<InviteState> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(userId);
  if (!id.success) return formError("This person is no longer on the team.");

  const team = await withUser((tx) => listTeam(tx, membership.locationId));
  const member = team.find((entry) => entry.userId === id.data);
  if (!member) return formError("This person is no longer on the team.");

  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: "recovery",
    email: member.email,
  });
  const link = error ? undefined : await accessLink(data.properties.hashed_token, "recovery");
  if (!link) return formError("Could not create a link. Try again.");
  return {
    ok: true,
    email: member.email,
    link,
    message: `Send this link to ${member.email}. It lets them choose a new password. It works once and expires after a day.`,
  };
}

export async function setMemberRole(userId: string, role: string): Promise<FormState> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(userId);
  const parsedRole = memberRoleSchema.safeParse(role);
  if (!id.success || !parsedRole.success) return formError("Could not change the role.");

  try {
    await withUser((tx) => changeMemberRole(tx, membership.locationId, id.data, parsedRole.data));
    refresh();
    return { ok: true, message: "Role changed." };
  } catch (error) {
    return toFormState(error);
  }
}

export async function removeTeamMember(userId: string): Promise<FormState> {
  const membership = await checkRole(OWNER_ROLES);
  if (!membership) return PERMISSION_DENIED;
  const id = idSchema.safeParse(userId);
  if (!id.success) return formError("This person is no longer on the team.");

  try {
    await withUser((tx) => removeMember(tx, membership.locationId, id.data));
    refresh();
    return { ok: true, message: "Removed from the team." };
  } catch (error) {
    return toFormState(error);
  }
}
