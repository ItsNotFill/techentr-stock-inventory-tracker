import type { Metadata } from "next";
import { Suspense } from "react";
import { MenuItemForm, NEW_MENU_ITEM_DEFAULTS } from "@/components/menu/menu-item-form";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Add menu item" };

export default function NewMenuItemPage() {
  return (
    <>
      <PageHeader
        title="Add menu item"
        description="You can add the recipe on the next screen."
        back={{ href: "/menu", label: "Back to menu" }}
      />
      <Suspense fallback={<CardsSkeleton cards={1} />}>
        <NewMenuItemContent />
      </Suspense>
    </>
  );
}

async function NewMenuItemContent() {
  await requireRole(MANAGER_ROLES);
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardContent>
          <MenuItemForm defaults={NEW_MENU_ITEM_DEFAULTS} />
        </CardContent>
      </Card>
    </div>
  );
}
