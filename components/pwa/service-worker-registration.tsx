"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js, built from pwa/sw.ts by
 * `npm run build`). Production only: `next dev` and the end-to-end tests run
 * without it, so nothing is served from a stale cache while developing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // No service worker means no offline screen; the app itself works the same.
    });
  }, []);
  return null;
}
