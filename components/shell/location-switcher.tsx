"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { MemberRole } from "@/lib/db/schema/enums";
import { cn } from "@/lib/utils";
import { useSwitchLocation } from "./use-switch-location";

export type SwitcherLocation = { locationId: string; locationName: string; role: MemberRole };

/**
 * The restaurant name in the shell, as a dropdown of the user's locations.
 * Only rendered for users with more than one location.
 */
export function LocationSwitcher({
  locations,
  currentId,
  variant,
  subtitle,
}: {
  locations: SwitcherLocation[];
  currentId: string;
  variant: "sidebar" | "topbar";
  subtitle: string;
}) {
  const { switchTo, pending } = useSwitchLocation();
  const current = locations.find((location) => location.locationId === currentId);
  const dark = variant === "sidebar";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        aria-label={`Location: ${current?.locationName ?? ""}. Change location`}
        className={cn(
          "flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60",
          dark
            ? "hover:bg-sidebar-accent focus-visible:outline-sidebar-ring"
            : "hover:bg-muted focus-visible:outline-ring",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-semibold", dark && "text-sidebar-title")}>
            {current?.locationName}
          </span>
          <span className={cn("block truncate text-xs", dark ? "text-sidebar-foreground" : "text-muted-foreground")}>
            {subtitle}
          </span>
        </span>
        <ChevronsUpDown
          className={cn("size-4 shrink-0", dark ? "text-sidebar-foreground" : "text-muted-foreground")}
          aria-hidden
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel>Your locations</DropdownMenuLabel>
        {locations.map((location) => (
          <DropdownMenuItem
            key={location.locationId}
            className="min-h-11 cursor-pointer gap-3"
            onSelect={() => {
              if (location.locationId !== currentId) switchTo(location.locationId);
            }}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{location.locationName}</span>
              <span className="block text-xs text-muted-foreground">{ROLE_LABELS[location.role]}</span>
            </span>
            {location.locationId === currentId ? <Check className="size-4 shrink-0" aria-label="Current" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
