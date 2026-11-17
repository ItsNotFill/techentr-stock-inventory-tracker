"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { approveCountAction, rejectCountAction } from "@/app/(app)/count/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Approve or reject a submitted count. */
export function ReviewActions({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  function approve() {
    startTransition(async () => {
      const result = await approveCountAction(sessionId);
      if (result.ok) {
        toast.success(result.message);
        router.push("/count");
      } else toast.error(result.message ?? "Something went wrong.");
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectCountAction(sessionId, note);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        setNote("");
        router.push("/count");
      } else {
        setNoteError(result.errors?.note?.[0] ?? null);
        if (!result.errors?.note) toast.error(result.message ?? "Something went wrong.");
      }
    });
  }

  return (
    <>
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
        <Button type="button" size="lg" className="h-12 text-base sm:min-w-36" disabled={pending} onClick={approve}>
          {pending ? "Working…" : "Approve"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-12 text-base sm:min-w-36"
          disabled={pending}
          onClick={() => setOpen(true)}
        >
          Reject
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this count?</DialogTitle>
            <DialogDescription>Stock does not change. The note is shown to the person who counted.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-note`} className="text-sm font-medium">
              Note (optional)
            </label>
            <Textarea
              id={`${uid}-note`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              aria-invalid={noteError ? true : undefined}
              rows={4}
            />
            {noteError ? <p className="text-sm text-destructive">{noteError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={reject}>
              {pending ? "Rejecting…" : "Reject count"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
