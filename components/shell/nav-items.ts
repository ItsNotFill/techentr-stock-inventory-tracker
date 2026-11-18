import {
  Carrot,
  CircleHelp,
  ClipboardList,
  FileUp,
  LayoutDashboard,
  Settings,
  Truck,
  TrendingDown,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { MemberRole } from "@/lib/db/schema/enums";
import { ALL_ROLES, MANAGER_ROLES, OWNER_ROLES } from "@/lib/auth/roles";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see the link. The page itself checks the role again. */
  roles: readonly MemberRole[];
  /**
   * Shown as its own tab on a phone. A phone has room for four tabs and "More";
   * the other links go in the "More" sheet. Roles with five links or fewer see
   * them all as tabs.
   */
  phoneTab?: boolean;
};

// One entry per screen that exists. Each stage adds its screens here.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL_ROLES, phoneTab: true },
  { href: "/ingredients", label: "Ingredients", icon: Carrot, roles: MANAGER_ROLES },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, roles: MANAGER_ROLES },
  { href: "/import", label: "Import sales", icon: FileUp, roles: MANAGER_ROLES },
  { href: "/unmapped", label: "Needs recipe", icon: CircleHelp, roles: MANAGER_ROLES },
  { href: "/count", label: "Count", icon: ClipboardList, roles: ALL_ROLES, phoneTab: true },
  { href: "/deliveries", label: "Deliveries", icon: Truck, roles: ALL_ROLES, phoneTab: true },
  { href: "/unexplained-usage", label: "Unexplained usage", icon: TrendingDown, roles: MANAGER_ROLES, phoneTab: true },
  { href: "/settings", label: "Settings", icon: Settings, roles: OWNER_ROLES },
];

/** The most links a phone tab bar shows before the rest move into "More". */
export const MAX_PHONE_TABS = 5;
