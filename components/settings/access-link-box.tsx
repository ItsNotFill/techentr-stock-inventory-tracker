"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InviteState } from "@/app/(app)/settings/actions";

/**
 * Shows the result of adding someone or creating a login link: the message and,
 * when there is one, the one-time link with a copy button. There is no
 * invitation e-mail, so the owner passes the link on.
 */
export function AccessLinkBox({ state }: { state: InviteState }) {
  const [copied, setCopied] = useState(false);
  if (!state.message) return null;

  const link = state.link;
  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-accent p-4 text-sm"
      role="status"
      aria-live="polite"
    >
      <p className="font-medium">{state.message}</p>
      {link ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={link}
              aria-label="One-time link"
              className="min-w-0 flex-1 bg-card read-only:bg-card"
              onFocus={(event) => event.currentTarget.select()}
            />
            <Button type="button" size="lg" variant="outline" onClick={copy} className="sm:w-36">
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
          <p className="text-muted-foreground">The person opens the link, chooses a password and is then in.</p>
        </>
      ) : null}
    </div>
  );
}
