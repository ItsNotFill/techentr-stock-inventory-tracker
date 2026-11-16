"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setMenuItemIgnored } from "@/app/(app)/menu/actions";
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

/** "Ignore" with a confirmation, for items that use no stock. */
export function IgnoreButton({ menuItemId, name }: { menuItemId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function ignore() {
    startTransition(async () => {
      const result = await setMenuItemIgnored(menuItemId, true);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "Something went wrong.");
      setOpen(false);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="lg" className="h-11" onClick={() => setOpen(true)}>
        Ignore
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ignore {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Use this for things that use no stock, like a service charge. Its sales will not change stock. You can
            undo this on the item&apos;s page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              ignore();
            }}
          >
            {pending ? "Ignoring…" : "Ignore"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
