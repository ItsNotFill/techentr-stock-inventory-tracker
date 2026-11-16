"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Shown inside the signed-in shell when a screen fails to load or save.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex max-w-md flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">
        The screen could not be loaded or your change could not be saved. Nothing was lost on the server. Try again; if
        it keeps happening, check your connection.
      </p>
      <Button type="button" size="lg" className="h-11" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
