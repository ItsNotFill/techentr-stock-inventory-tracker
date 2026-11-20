"use client";

import { Copy, Mail } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { buttonVariants, Button } from "@/components/ui/button";

/** The order as text, with "Copy text" and, when the supplier has an e-mail, "E-mail it". The app sends nothing itself. */
export function OrderText({ text, email, restaurantName }: { text: string; email: string | null; restaurantName: string }) {
  const uid = useId();
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(`Order from ${restaurantName}`)}&body=${encodeURIComponent(text)}`
    : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Order text copied.");
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`${uid}-text`} className="text-sm font-medium">
        Order as text
      </label>
      <textarea
        id={`${uid}-text`}
        readOnly
        value={text}
        rows={Math.min(14, text.split("\n").length + 1)}
        className="w-full rounded-lg border border-input bg-muted p-3 font-mono text-sm text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="lg" onClick={copy}>
          <Copy aria-hidden />
          Copy text
        </Button>
        {mailto ? (
          <a href={mailto} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Mail aria-hidden />
            E-mail it
          </a>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">The app does not send anything itself: copy the text or e-mail it, then mark the order as sent.</p>
    </div>
  );
}
