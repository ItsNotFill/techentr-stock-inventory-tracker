"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setIngredientArchived } from "@/app/(app)/ingredients/actions";
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

/** Archive (with a confirmation) or restore (straight away) an ingredient. */
export function ArchiveButton({
  ingredientId,
  archived,
  size = "lg",
}: {
  ingredientId: string;
  archived: boolean;
  size?: "default" | "lg";
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function run(nextArchived: boolean) {
    startTransition(async () => {
      const result = await setIngredientArchived(ingredientId, nextArchived);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  if (archived) {
    return (
      <Button type="button" variant="outline" size={size} className="h-11" disabled={pending} onClick={() => run(false)}>
        {pending ? "Restoring…" : "Restore"}
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="destructive" size={size} className="h-11" onClick={() => setOpen(true)}>
        Archive
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this ingredient?</AlertDialogTitle>
          <AlertDialogDescription>Archived ingredients are hidden from lists. Their history is kept.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              run(true);
            }}
          >
            {pending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
