import { Carrot, LayoutDashboard, Settings, UtensilsCrossed, type LucideIcon } from "lucide-react";
import type { MemberRole } from "@/lib/db/schema/enums";
import { ALL_ROLES, MANAGER_ROLES, OWNER_ROLES } from "@/lib/auth/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see the link. The page itself checks the role again. */
  roles: readonly MemberRole[];
};

// One entry per screen that exists. Each stage adds its screens here.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES },
  { href: "/ingredients", label: "Ingredients", icon: Carrot, roles: MANAGER_ROLES },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, roles: MANAGER_ROLES },
  { href: "/settings", label: "Settings", icon: Settings, roles: OWNER_ROLES },
];
