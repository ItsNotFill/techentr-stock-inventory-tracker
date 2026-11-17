import { cn } from "@/lib/utils";

/**
 * One item in the dark green navigation (sidebar links, the "More" sheet and the
 * sidebar's log-out button). The current page is a filled green pill.
 */
export function sidebarItemClass(active = false) {
  return cn(
    "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
    active
      ? "bg-sidebar-primary font-semibold text-sidebar-primary-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
  );
}
