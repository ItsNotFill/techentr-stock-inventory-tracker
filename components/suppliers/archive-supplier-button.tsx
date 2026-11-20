"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSupplierActiveAction } from "@/app/(app)/suppliers/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Archive (with a confirmation) or restore (straight away) a supplier. */
export function ArchiveSupplierButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run(active: boolean) {
    startTransition(async () => {
      const result = await setSupplierActiveAction(id, active);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  if (archived) {
    return (
      <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => run(true)}>
        {pending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="destructive-outline" size="lg" onClick={() => setOpen(true)}>
        Archive
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this supplier?</AlertDialogTitle>
          <AlertDialogDescription>
            It no longer shows in pickers or on new orders. Its ingredients and past orders keep it, and you can restore it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              run(false);
            }}
          >
            {pending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
