"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { switchLocationAction } from "@/app/(app)/locations/actions";
import { PAGES_CACHE } from "@/lib/pwa/caches";

/**
 * Switches to another location: clears the offline copies of screens (they
 * belong to the old location), sets the cookie, then opens the dashboard.
 */
export function useSwitchLocation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  function switchTo(locationId: string) {
    setSwitchingId(locationId);
    startTransition(async () => {
      try {
        if ("caches" in window) await caches.delete(PAGES_CACHE);
      } catch {
        // Storage blocked: nothing was kept either.
      }
      const result = await switchLocationAction(locationId);
      if (result.ok) {
        toast.success(result.message ?? "Location changed.");
        router.push("/dashboard");
      } else {
        toast.error(result.message ?? "Could not switch location.");
      }
      setSwitchingId(null);
    });
  }

  return { switchTo, pending, switchingId };
}
