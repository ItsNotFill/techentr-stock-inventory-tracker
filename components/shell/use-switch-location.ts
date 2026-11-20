"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { switchLocationAction } from "@/app/(app)/locations/actions";
import { clearOfflinePages } from "@/lib/pwa/offline-copy";

/**
 * Switches to another location: sets the cookie, clears the offline copies of
 * screens (they belong to the old location), then opens the dashboard.
 */
export function useSwitchLocation() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  function switchTo(locationId: string) {
    setSwitchingId(locationId);
    startTransition(async () => {
      const result = await switchLocationAction(locationId);
      if (result.ok) {
        // Only now: the copies belong to the old location, and a failed switch keeps them.
        await clearOfflinePages();
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
