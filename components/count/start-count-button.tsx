"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { startCountAction } from "@/app/(app)/count/actions";
import { Button } from "@/components/ui/button";

/** Starts a count (or returns to the user's draft) and opens the count sheet. */
export function StartCountButton({ hasDraft }: { hasDraft: boolean }) {
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
    <Button type="button" size="lg" className="h-14 w-full text-lg md:w-auto md:px-8" disabled={pending} onClick={start}>
      {pending ? "Opening…" : hasDraft ? "Continue your count" : "Start a count"}
    </Button>
  );
}
