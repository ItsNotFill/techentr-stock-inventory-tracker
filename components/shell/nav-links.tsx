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

function useVisibleItems(role: MemberRole) {
  const pathname = usePathname();
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    active: pathname === item.href || pathname.startsWith(`${item.href}/`),
  }));
}

/** Vertical list for the desktop sidebar. The current page has an accent tint and bar. */
export function SidebarLinks({ role }: { role: MemberRole }) {
  const items = useVisibleItems(role);
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            active
              ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary"
              : "text-sidebar-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-[18px] shrink-0",
              active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
            aria-hidden
          />
          {label}
        </Link>
      ))}
    </nav>
  );
}

const tabClass = (active: boolean) =>
  cn(
    "group flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-1 text-center text-[0.6875rem] leading-tight font-medium transition-colors",
    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
  );

const iconPillClass = (active: boolean) =>
  cn(
    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
    active ? "bg-accent" : "group-hover:bg-muted",
  );

/**
 * Tab bar fixed to the bottom of a phone screen. Up to five links fit; with
 * more, four stay as tabs and the rest open from "More" in a sheet.
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-strong bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
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
              <SheetContent side="bottom" className="rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
                <SheetHeader className="pb-0">
                  <SheetTitle>More</SheetTitle>
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
                            className={cn(
                              "flex min-h-12 items-center gap-3 rounded-lg px-3 text-base font-medium transition-colors",
                              active
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground hover:bg-muted",
                            )}
                          >
                            <Icon
                              className={cn("size-5", active ? "text-primary" : "text-muted-foreground")}
                              aria-hidden
                            />
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
