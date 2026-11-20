"use client";

import { ClipboardList } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { startCountAction } from "@/app/(app)/count/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Starts a count (or returns to the user's draft) and opens the count sheet. */
export function StartCountButton({ hasDraft, className }: { hasDraft: boolean; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      try {
        const result = await startCountAction(crypto.randomUUID());
        if (result.ok && result.id) {
          // The sheet keeps its own offline copy once it is open (lib/pwa/offline-copy.ts).
          router.push(`/count/${result.id}`);
        } else {
          toast.error(result.message ?? "Could not start the count.");
        }
      } catch {
        // The server could not be reached.
        toast.error("You need a connection to start a count. Once the count is open you can keep counting without signal.");
      }
    });
  }

  return (
    <Button
      type="button"
      size="lg"
      className={cn("h-12 text-base sm:h-11 sm:text-sm", className)}
      disabled={pending}
      onClick={start}
    >
      <ClipboardList aria-hidden />
      {pending ? "Opening…" : hasDraft ? "Continue your count" : "Start a count"}
    </Button>
  );
}
