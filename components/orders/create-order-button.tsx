"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createOrderAction } from "@/app/(app)/orders/actions";
import { Button } from "@/components/ui/button";

/** Starts a draft order for a supplier and opens it. */
export function CreateOrderButton({
  supplierId,
  fromSuggestions,
  label,
  variant = "outline",
}: {
  supplierId: string;
  fromSuggestions: boolean;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createOrderAction(supplierId, fromSuggestions);
        if (result.ok && result.id) router.push(`/orders/${result.id}`);
        else setError(result.message ?? "Could not start the order.");
      } catch {
        setError("Could not reach the server. Try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant={variant} size="lg" disabled={pending} onClick={create}>
        {pending ? "Starting…" : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
