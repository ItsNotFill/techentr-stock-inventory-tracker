"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { undoSalesImport } from "@/app/(app)/import/actions";
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

/** Undo one import, after a confirmation. */
export function UndoButton({ importId }: { importId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function undo() {
    startTransition(async () => {
      const result = await undoSalesImport(importId);
      if (result.ok) toast.success(result.message ?? "Import undone.");
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Undo
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo this import?</AlertDialogTitle>
          <AlertDialogDescription>
            Its sales are removed and the stock they used comes back. You can import the file again afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              undo();
            }}
          >
            {pending ? "Undoing…" : "Undo import"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
