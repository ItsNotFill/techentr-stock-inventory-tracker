"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server HTML and until React has taken over the page in the
 * browser, true after. A submit button disabled until then cannot be tapped
 * while a slow phone is still loading the page, which would do nothing visible.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
