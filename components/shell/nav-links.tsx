"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/db/schema/enums";
import { NAV_ITEMS } from "./nav-items";

function useVisibleItems(role: MemberRole) {
  const pathname = usePathname();
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));
}

/** Vertical list for the desktop sidebar. */
export function SidebarLinks({ role }: { role: MemberRole }) {
  const items = useVisibleItems(role);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Tab bar fixed to the bottom of a phone screen. Scrolls sideways when it has many items. */
export function BottomTabs({ role }: { role: MemberRole }) {
  const items = useVisibleItems(role);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-w-20 flex-1 flex-col items-center gap-1 px-2 py-2.5 text-xs font-medium",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <Icon className="size-5" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
