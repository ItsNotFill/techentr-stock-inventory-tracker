import { isUncachedPath, PAGES_CACHE } from "./caches";

/**
 * Keeps a copy of a screen for offline use, in the cache the service worker
 * reads when there is no signal (pwa/sw.ts). The worker only sees screens
 * opened with a full page load; a screen reached by a link inside the app is
 * not one, so the count sheet calls this to reopen without signal however it
 * was reached (DECISIONS.md 94).
 *
 * Does nothing in development (no service worker), without the Cache API, or
 * when the screen cannot be fetched now. Never keeps an error page or the page
 * a redirect ended on (a session that expired lands on the login page).
 */
export async function keepOfflineCopy(path: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller) return;
  const url = new URL(path, window.location.origin);
  if (url.origin !== window.location.origin || isUncachedPath(url.pathname)) return;
  try {
    const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } });
    if (!response.ok || response.redirected) return;
    const cache = await caches.open(PAGES_CACHE);
    await cache.put(url.href, response);
  } catch {
    // No signal right now: the copy kept earlier, if any, stays.
  }
}
