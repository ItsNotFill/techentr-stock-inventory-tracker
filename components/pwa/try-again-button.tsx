"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Reloads the page the person was trying to open. */
export function TryAgainButton() {
  return (
    <Button type="button" size="lg" className="w-full" onClick={() => window.location.reload()}>
      <RotateCw aria-hidden />
      Try again
    </Button>
  );
}
