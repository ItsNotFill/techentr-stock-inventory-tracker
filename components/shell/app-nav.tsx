import { LogOut, Store } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyLocations, requireMembership } from "@/lib/auth/membership";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { LocationSwitcher } from "./location-switcher";
import { BottomTabs, SidebarLinks } from "./nav-links";
import { sidebarItemClass } from "./nav-style";

function RestaurantMark() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Store className="size-5" aria-hidden />
    </span>
  );
}

/**
 * The navigation around every signed-in screen: a dark green sidebar on
 * desktop; on a phone a light top bar and a dark green tab bar at the bottom.
 * It reads the session, so the layout renders it inside <Suspense>.
 */
export async function AppNav() {
  const membership = await requireMembership();
  const locations = await getMyLocations();
  const switcher = locations.length > 1 ? locations : null;

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 md:hidden">
        {switcher ? (
          <LocationSwitcher
            locations={switcher}
            currentId={membership.locationId}
            variant="topbar"
            subtitle={ROLE_LABELS[membership.role]}
          />
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <RestaurantMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{membership.locationName}</p>
              <p className="text-xs text-muted-foreground">{ROLE_LABELS[membership.role]}</p>
            </div>
          </div>
        )}
        <form action={signOut}>
          <Button type="submit" variant="outline" className="px-3">
            <LogOut aria-hidden />
            Log out
          </Button>
        </form>
      </header>

      <aside className="hidden w-64 shrink-0 bg-sidebar md:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
          {switcher ? (
            <div className="flex pt-1">
              <LocationSwitcher
                locations={switcher}
                currentId={membership.locationId}
                variant="sidebar"
                subtitle={`${ROLE_LABELS[membership.role]}${membership.email ? ` · ${membership.email}` : ""}`}
              />
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-3 px-1 pt-1">
              <RestaurantMark />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-sidebar-title">{membership.locationName}</p>
                <p className="truncate text-xs text-sidebar-foreground">
                  {ROLE_LABELS[membership.role]}
                  {membership.email ? ` · ${membership.email}` : ""}
                </p>
              </div>
            </div>
          )}
          <div className="flex-1">
            <SidebarLinks role={membership.role} />
          </div>
          <form action={signOut} className="border-t border-sidebar-border pt-3">
            <button type="submit" className={sidebarItemClass()}>
              <LogOut className="size-[18px] shrink-0" aria-hidden />
              Log out
            </button>
          </form>
        </div>
      </aside>

      <BottomTabs role={membership.role} />
    </>
  );
}

export function AppNavSkeleton() {
  return (
    <>
      <div className="flex h-15 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="hidden w-64 shrink-0 bg-sidebar md:block">
        <div className="flex h-dvh flex-col gap-3 p-4">
          <Skeleton className="h-9 w-44 bg-sidebar-accent" />
          <Skeleton className="mt-3 h-9 w-full bg-sidebar-accent" />
          <Skeleton className="h-9 w-full bg-sidebar-accent" />
          <Skeleton className="h-9 w-full bg-sidebar-accent" />
        </div>
      </div>
    </>
  );
}
