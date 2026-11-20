"use client";

import { CheckIcon, Loader2Icon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { CountSyncState } from "@/lib/counts/offline";
import { cn } from "@/lib/utils";

/** How long "All figures saved" stays after the signal came back. */
const RECOVERED_MS = 4_000;

/**
 * Calm status for the count sheet's offline sync (DECISIONS.md 94). Warning
 * style, because having no signal is not an error. Shows nothing during a
 * normal save while online. The live region is always in the page so screen
 * readers announce changes politely.
 */
export function SyncStatus({
  state,
  className,
}: {
  state: CountSyncState;
  className?: string;
}) {
  const { unreachable, syncing, submitWaiting, submitted } = state;
  const waiting = state.pending.length;

  // Signal came back: confirm for a moment. Detected while rendering, cleared by a timer.
  const [wasUnreachable, setWasUnreachable] = useState(false);
  const [recovered, setRecovered] = useState(false);
  if (unreachable !== wasUnreachable) {
    setWasUnreachable(unreachable);
    if (!unreachable && !submitted) setRecovered(true);
  }
  useEffect(() => {
    if (!recovered) return;
    const timer = setTimeout(() => setRecovered(false), RECOVERED_MS);
    return () => clearTimeout(timer);
  }, [recovered]);

  let content: React.ReactNode = null;
  if (unreachable && syncing) {
    content = (
      <Line
        tone="warning"
        icon={<Loader2Icon className="animate-spin" aria-hidden />}
      >
        Sending…
      </Line>
    );
  } else if (unreachable && submitWaiting) {
    content = (
      <Line
        tone="warning"
        icon={<WifiOffIcon aria-hidden />}
        detail="The count is kept on this phone and is submitted as soon as there is a connection."
      >
        Submit waiting for signal
      </Line>
    );
  } else if (unreachable) {
    content = (
      <Line
        tone="warning"
        icon={<WifiOffIcon aria-hidden />}
        detail="They are sent as soon as there is signal."
      >
        No connection · {waiting} {waiting === 1 ? "figure" : "figures"} kept on
        this phone
      </Line>
    );
  } else if (recovered) {
    content = (
      <Line tone="success" icon={<CheckIcon aria-hidden />}>
        All figures saved
      </Line>
    );
  }

  return (
    <div role="status" aria-live="polite" className={className}>
      {content}
    </div>
  );
}

function Line({
  tone,
  icon,
  detail,
  children,
}: {
  tone: "warning" | "success";
  icon: React.ReactNode;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-h-11 items-start gap-2.5 rounded-lg px-3 py-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "warning"
          ? "bg-warning text-warning-foreground"
          : "bg-success text-success-foreground",
      )}
    >
      {icon}
      <div className="flex flex-col">
        <span className="font-medium">{children}</span>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  );
}
