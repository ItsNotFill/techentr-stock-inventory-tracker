import type { MemberRole } from "@/lib/db/schema/enums";

// Who may do what, in one place. Safe to import from Client Components.
// The database enforces the same rules through RLS; these keep the UI and the
// Server Actions in line with it.

/** Recipes, ingredients, imports, approving counts. */
export const MANAGER_ROLES: readonly MemberRole[] = ["owner", "manager"];
/** Team, restaurant details. */
export const OWNER_ROLES: readonly MemberRole[] = ["owner"];
export const ALL_ROLES: readonly MemberRole[] = ["owner", "manager", "staff"];

export function canManage(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role);
}

export function isOwner(role: MemberRole): boolean {
  return role === "owner";
}

/** Costs and euro figures are for owners and managers (DECISIONS.md, entry 24). */
export function canSeeMoney(role: MemberRole): boolean {
  return canManage(role);
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};
