/**
 * Names shared by the service worker (pwa/sw.ts) and the screens.
 * Safe to import anywhere: no server code, no browser-only code.
 */

/** Copies of screens a signed-in user opened, kept so they open offline. */
export const PAGES_CACHE = "pages";

/** The screen shown offline for a page this phone has never opened. */
export const OFFLINE_PATH = "/~offline";

/** Never cached: e-mail link handling and the API. */
export function isUncachedPath(pathname: string): boolean {
  return pathname.startsWith("/auth/") || pathname.startsWith("/api/");
}
