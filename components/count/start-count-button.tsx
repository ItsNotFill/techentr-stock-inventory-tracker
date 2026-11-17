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
      const result = await startCountAction(crypto.randomUUID());
      if (result.ok && result.id) {
        router.push(`/count/${result.id}`);
      } else {
        toast.error(result.message ?? "Could not start the count.");
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
