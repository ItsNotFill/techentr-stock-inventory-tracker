import { LogOut } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireMembership } from "@/lib/auth/membership";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { BottomTabs, SidebarLinks } from "./nav-links";

/**
 * The navigation around every signed-in screen: a sidebar on desktop, a top
 * bar and bottom tabs on a phone. It reads the session, so the layout renders
 * it inside <Suspense>.
 */
export async function AppNav() {
  const membership = await requireMembership();

  const signOutButton = (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
        <LogOut className="size-4" aria-hidden />
        Log out
      </Button>
    </form>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background px-4 py-2 md:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{membership.locationName}</p>
          <p className="text-xs text-muted-foreground">{ROLE_LABELS[membership.role]}</p>
        </div>
        {signOutButton}
      </header>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r p-4 md:flex">
        <div className="min-w-0 px-3">
          <p className="truncate text-sm font-semibold">{membership.locationName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABELS[membership.role]}
            {membership.email ? ` · ${membership.email}` : ""}
          </p>
        </div>
        <div className="flex-1">
          <SidebarLinks role={membership.role} />
        </div>
        {signOutButton}
      </aside>

      <BottomTabs role={membership.role} />
    </>
  );
}

export function AppNavSkeleton() {
  return (
    <>
      <div className="flex items-center border-b px-4 py-3 md:hidden">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="hidden h-dvh w-60 shrink-0 flex-col gap-3 border-r p-4 md:flex">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </>
  );
}
