import { Store, WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { TryAgainButton } from "@/components/pwa/try-again-button";

export const metadata: Metadata = { title: "Offline" };

/**
 * Shown by the service worker for a screen this phone has never opened while
 * there is no connection (pwa/sw.ts). Fully static, so it is precached: no
 * session, no data.
 */
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="size-5" aria-hidden />
          </span>
          Restaurant Inventory
        </span>
        <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-border bg-card p-6 shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-warning text-warning-foreground">
            <WifiOff className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">No connection</h1>
          <p className="text-sm text-muted-foreground">
            This screen needs the internet the first time you open it. Screens you opened before still work offline.
            Try again once you have signal.
          </p>
          <TryAgainButton />
        </div>
      </div>
    </main>
  );
}
