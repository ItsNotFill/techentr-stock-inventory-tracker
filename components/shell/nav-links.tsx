"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { MemberRole } from "@/lib/db/schema/enums";
import { MAX_PHONE_TABS, NAV_ITEMS } from "./nav-items";
import { sidebarItemClass } from "./nav-style";

function useVisibleItems(role: MemberRole) {
  const pathname = usePathname();
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));
}

/** Vertical list for the desktop sidebar. The current page is a filled green pill. */
export function SidebarLinks({ role }: { role: MemberRole }) {
  const items = useVisibleItems(role);
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link key={href} href={href} aria-current={active ? "page" : undefined} className={sidebarItemClass(active)}>
          <Icon className="size-[18px] shrink-0" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "group flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-1 text-center text-[0.6875rem] leading-tight font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-sidebar-ring",
    active ? "text-sidebar-title" : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
  );

const iconPillClass = (active: boolean) =>
  cn(
    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
    active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "group-hover:bg-sidebar-accent",
  );

/**
 * Tab bar fixed to the bottom of a phone screen, in the sidebar's colours. Up
 * to five links fit; with more, four stay as tabs and the rest open from
 * "More" in a sheet.
 */
export function BottomTabs({ role }: { role: MemberRole }) {
  const items = useVisibleItems(role);
  const [moreOpen, setMoreOpen] = useState(false);
  const overflow = items.length > MAX_PHONE_TABS;
  const tabs = overflow ? items.filter((item) => item.phoneTab) : items;
  const more = overflow ? items.filter((item) => !item.phoneTab) : [];
  const moreActive = more.some((item) => item.active);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 bg-sidebar pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-(--tabbar-height)">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <li key={href} className="min-w-0 flex-1">
            <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
              <span className={iconPillClass(active)}>
                <Icon className="size-5" aria-hidden />
              </span>
              {label}
            </Link>
          </li>
        ))}
        {more.length > 0 ? (
          <li className="min-w-0 flex-1">
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button type="button" className={tabClass(moreActive)}>
                  <span className={iconPillClass(moreActive)}>
                    <Ellipsis className="size-5" aria-hidden />
                  </span>
                  More
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="rounded-t-lg border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground [&_[data-slot=sheet-close]]:text-sidebar-foreground [&_[data-slot=sheet-close]]:hover:bg-sidebar-accent [&_[data-slot=sheet-close]]:hover:text-sidebar-accent-foreground"
              >
                <SheetHeader className="pb-0">
                  <SheetTitle className="text-sidebar-title">More</SheetTitle>
                  <SheetDescription className="sr-only">The other screens of the app.</SheetDescription>
                </SheetHeader>
                <nav aria-label="More" className="px-2 pb-4">
                  <ul className="flex flex-col gap-1">
                    {more.map(({ href, label, icon: Icon, active }) => (
                      <li key={href}>
                        <SheetClose asChild>
                          <Link
                            href={href}
                            aria-current={active ? "page" : undefined}
                            className={cn(sidebarItemClass(active), "min-h-12 text-base")}
                          >
                            <Icon className="size-5 shrink-0" aria-hidden />
                            {label}
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
