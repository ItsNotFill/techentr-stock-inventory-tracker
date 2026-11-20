import { CookingPot, FileSpreadsheet, Plus, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
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
      <PageHeader title="Menu" description="What your POS sells. A recipe on an item makes its sales use stock.">
        <Button asChild size="lg">
          <Link href="/menu/new">
            <Plus aria-hidden />
            Add item
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/prep">
            <CookingPot aria-hidden />
            Prep recipes
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/setup">
            <FileSpreadsheet aria-hidden />
            Import from spreadsheet
          </Link>
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

  if (items.length === 0) {
    return (
      <EmptyState
        icon={UtensilsCrossed}
        title="No menu items yet"
        description="The menu is what your POS sells. Give each item a recipe and every sale uses up the right amount of stock. Add the first item to get started."
      >
        <Button asChild size="lg">
          <Link href="/menu/new">
            <Plus aria-hidden />
            Add item
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/setup">
            <FileSpreadsheet aria-hidden />
            Import from spreadsheet
          </Link>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((entry) => {
          const active = filter === entry.value;
          return (
            <Link
              key={entry.value}
              href={entry.value === "all" ? "/menu" : `/menu?status=${entry.value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors md:h-10",
                active
                  ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                  : "border-border bg-card text-foreground hover:border-muted-foreground/50 hover:bg-row-hover",
              )}
            >
              {entry.label} ({counts[entry.value]})
            </Link>
          );
        })}
      </nav>
      {shown.length === 0 ? (
        <EmptyState size="sm" title="No items match this filter.">
          <Button asChild variant="outline">
            <Link href="/menu">Show all items</Link>
          </Button>
        </EmptyState>
      ) : (
        <MenuItemList items={shown} />
      )}
    </div>
  );
}
