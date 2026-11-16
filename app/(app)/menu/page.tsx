import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MenuItemList } from "@/components/menu/menu-item-list";
import { PageHeader } from "@/components/page-header";
import { TableSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { listMenuItems } from "@/lib/menu";
import { MENU_ITEM_STATUS_LABELS, menuItemStatus, type MenuItemStatus } from "@/lib/menu/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Menu" };

type Filter = "all" | MenuItemStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unmapped", label: MENU_ITEM_STATUS_LABELS.unmapped },
  { value: "mapped", label: MENU_ITEM_STATUS_LABELS.mapped },
  { value: "ignored", label: MENU_ITEM_STATUS_LABELS.ignored },
];

export default function MenuPage({ searchParams }: PageProps<"/menu">) {
  return (
    <>
      <PageHeader title="Menu">
        <Button asChild size="lg" className="h-11">
          <Link href="/menu/new">Add item</Link>
        </Button>
      </PageHeader>
      <Suspense fallback={<TableSkeleton />}>
        <MenuContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MenuContent({ searchParams }: { searchParams: PageProps<"/menu">["searchParams"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { status } = await searchParams;
  const filter: Filter = FILTERS.find((entry) => entry.value === status)?.value ?? "all";
  const items = await withUser((tx) => listMenuItems(tx, membership.locationId));

  const counts: Record<Filter, number> = { all: items.length, unmapped: 0, mapped: 0, ignored: 0 };
  for (const item of items) counts[menuItemStatus(item)] += 1;
  const shown = filter === "all" ? items : items.filter((item) => menuItemStatus(item) === filter);

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">No menu items yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            The menu is what your POS sells. Give each item a recipe and every sale uses up the right amount of
            stock. Add the first item to get started.
          </p>
          <Button asChild size="lg" className="h-11">
            <Link href="/menu/new">Add item</Link>
          </Button>
        </div>
      ) : (
        <>
          <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
            {FILTERS.map((entry) => (
              <Link
                key={entry.value}
                href={entry.value === "all" ? "/menu" : `/menu?status=${entry.value}`}
                aria-current={filter === entry.value ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm",
                  filter === entry.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
                )}
              >
                {entry.label} ({counts[entry.value]})
              </Link>
            ))}
          </nav>
          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No items match this filter.
            </p>
          ) : (
            <MenuItemList items={shown} />
          )}
        </>
      )}
    </div>
  );
}
