"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeMenuItem, setMenuItemIgnored } from "@/app/(app)/menu/actions";
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
import { Card, CardContent } from "@/components/ui/card";

/** Ignore / stop ignoring, and delete (with a confirmation). */
export function ItemActions({
  menuItemId,
  hasRecipe,
  ignored,
}: {
  menuItemId: string;
  hasRecipe: boolean;
  ignored: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function setIgnored(next: boolean) {
    startTransition(async () => {
      const result = await setMenuItemIgnored(menuItemId, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message ?? "Something went wrong.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeMenuItem(menuItemId);
      if (result.ok) {
        toast.success(result.message);
        router.push("/menu");
      } else {
        toast.error(result.message ?? "Something went wrong.");
        setOpen(false);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {ignored ? (
          <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => setIgnored(false)}>
              Stop ignoring
            </Button>
            <p className="text-sm text-muted-foreground">This item is ignored: its sales do not use stock.</p>
          </div>
        ) : hasRecipe ? null : (
          <div className="flex flex-col items-start gap-2">
            <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => setIgnored(true)}>
              Ignore this item
            </Button>
            <p className="text-sm text-muted-foreground">For things that use no stock, like a service charge.</p>
          </div>
        )}

        <div>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <Button type="button" variant="destructive" size="lg" onClick={() => setOpen(true)}>
              Delete item
            </Button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this item?</AlertDialogTitle>
                <AlertDialogDescription>The item and its recipe are removed from the menu.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={pending}
                  onClick={(event) => {
                    event.preventDefault();
                    remove();
                  }}
                >
                  {pending ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
