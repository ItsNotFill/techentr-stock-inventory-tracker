"use client";

import { useEffect } from "react";
import { PAGES_CACHE } from "@/lib/pwa/caches";

/**
 * Deletes the copies of screens the service worker kept for offline use.
 * Sits on the login page: logging out lands there, and whoever logs in next
 * on the same phone must not see the last person's screens offline.
 */
export function ClearOfflinePages() {
  useEffect(() => {
    if (!("caches" in window)) return;
    caches.delete(PAGES_CACHE).catch(() => {
      // Storage blocked (private window): nothing was kept either.
    });
  }, []);
  return null;
}
