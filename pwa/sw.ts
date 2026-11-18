/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig, SerwistPlugin } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";
import { isUncachedPath, OFFLINE_PATH, PAGES_CACHE } from "../lib/pwa/caches";

/**
 * The service worker. Built by `serwist build` after `next build` into
 * public/sw.js (serwist.config.mjs); registered by
 * components/pwa/service-worker-registration.tsx, in production only.
 *
 * What it keeps (DECISIONS.md 87):
 * - the build's JS and CSS, icons and fonts, and the offline screen, so the
 *   app shell opens with no signal;
 * - copies of screens the user opened (network first, the copy only when
 *   offline), so those open offline too; the login page clears them;
 * - nothing else: data (RSC payloads), Server Actions, the API, e-mail links
 *   and Supabase always go to the network.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const DAY = 24 * 60 * 60;

/** Keep only real pages: no errors, and not the login page a redirect ended on. */
const onlyFinalPages: SerwistPlugin = {
  cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null),
};

const runtimeCaching: RuntimeCaching[] = [
  {
    // Build files have a content hash in their name and never change.
    matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "next-static",
      plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * DAY, maxAgeFrom: "last-used" })],
    }),
  },
  {
    matcher: ({ sameOrigin, request }) => sameOrigin && (request.destination === "image" || request.destination === "font"),
    handler: new StaleWhileRevalidate({
      cacheName: "static-assets",
      plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * DAY })],
    }),
  },
  {
    // Screens: from the network; with no signal, the copy this phone last saw.
    matcher: ({ sameOrigin, request, url }) => sameOrigin && request.mode === "navigate" && !isUncachedPath(url.pathname),
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE,
      networkTimeoutSeconds: 10,
      plugins: [onlyFinalPages, new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * DAY })],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    // A screen this phone never opened, while offline.
    entries: [{ url: OFFLINE_PATH, matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
