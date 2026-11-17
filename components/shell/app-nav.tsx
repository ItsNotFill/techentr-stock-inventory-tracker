import { LogOut, Store } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMembership } from "@/lib/auth/membership";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { BottomTabs, SidebarLinks } from "./nav-links";

function RestaurantMark() {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Store className="size-5" aria-hidden />
    </span>
  );
}

/**
 * The navigation around every signed-in screen: a sidebar on desktop, a top
 * bar and bottom tabs on a phone. It reads the session, so the layout renders
 * it inside <Suspense>.
 */
export async function AppNav() {
  const membership = await requireMembership();

  const signOutButton = (className?: string) => (
    <form action={signOut}>
      <Button type="submit" variant="outline" className={className}>
        <LogOut aria-hidden />
        Log out
      </Button>
    </form>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border-strong bg-card px-4 py-2 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <RestaurantMark />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{membership.locationName}</p>
            <p className="text-xs text-muted-foreground">{ROLE_LABELS[membership.role]}</p>
          </div>
        </div>
        {signOutButton("h-11 px-3")}
      </header>

      <aside className="hidden w-64 shrink-0 border-r border-border-strong bg-sidebar md:block">
        <div className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto p-4">
          <div className="flex min-w-0 items-center gap-3 px-1 pt-1">
            <RestaurantMark />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{membership.locationName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ROLE_LABELS[membership.role]}
                {membership.email ? ` · ${membership.email}` : ""}
              </p>
            </div>
          </div>
          <div className="flex-1">
            <SidebarLinks role={membership.role} />
          </div>
          {signOutButton("w-full justify-start")}
        </div>
      </aside>

      <BottomTabs role={membership.role} />
    </>
  );
}

export function AppNavSkeleton() {
  return (
    <>
      <div className="flex h-15 items-center gap-3 border-b border-border-strong bg-card px-4 md:hidden">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="hidden w-64 shrink-0 border-r border-border-strong bg-sidebar md:block">
        <div className="flex h-dvh flex-col gap-3 p-4">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="mt-3 h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </>
  );
}
