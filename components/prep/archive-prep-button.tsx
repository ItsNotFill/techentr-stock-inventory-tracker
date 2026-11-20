"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPrepRecipeActiveAction } from "@/app/(app)/prep/actions";
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

/** Archive (with a confirmation) or restore (straight away) a prep recipe. */
export function ArchivePrepButton({ id, archived }: { id: string; archived: boolean }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run(active: boolean) {
    startTransition(async () => {
      const result = await setPrepRecipeActiveAction(id, active);
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
          <AlertDialogTitle>Archive this prep recipe?</AlertDialogTitle>
          <AlertDialogDescription>
            It can no longer be added to new recipes. Recipes that already use it keep working.
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
