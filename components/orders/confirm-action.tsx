"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { FormState } from "@/lib/validation/form";

/** A `destructive-outline` button that asks first, then runs a Server Action. */
export function ConfirmAction({
  label,
  title,
  description,
  confirmLabel,
  pendingLabel,
  action,
  onDone,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  action: () => Promise<FormState>;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setOpen(false);
          toast.success(result.message ?? "Done.");
          onDone?.();
        } else {
          toast.error(result.message ?? "That did not work.");
        }
      } catch {
        toast.error("Could not reach the server. Try again.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="destructive-outline" size="lg" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                run();
              }}
            >
              {pending ? pendingLabel : confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
