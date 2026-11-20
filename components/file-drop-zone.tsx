"use client";

import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A big dashed box for choosing a file: tap it, or drop a file on it. The real
 * file input is hidden (`sr-only`) but stays in the page for keyboards and
 * tests. When a file is chosen, `fileName` is shown with a "Change" hint.
 */
export function FileDropZone({
  label,
  hint = "Tap here, or drop the file on this box",
  accept,
  disabled,
  onFile,
  fileName,
  buttonVariant = "default",
  ariaLabel,
  className,
}: {
  /** The button text, e.g. "Choose a CSV file". */
  label: string;
  hint?: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File | undefined) => void;
  fileName?: string | null;
  /** `default` when choosing the file is the step's main action, otherwise `outline`. */
  buttonVariant?: "default" | "outline";
  /** Names the hidden file input for screen readers and tests. */
  ariaLabel?: string;
  className?: string;
}) {
  const uid = useId();
  const [dragging, setDragging] = useState(false);
  return (
    <label
      htmlFor={`${uid}-file`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) onFile(event.dataTransfer.files[0]);
      }}
      className={cn(
        "group flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        dragging ? "border-primary bg-accent" : "border-border hover:border-primary hover:bg-accent/50",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-primary">
        <Upload className="size-5" aria-hidden />
      </span>
      <span className={buttonVariants({ variant: buttonVariant, size: "lg", className: "pointer-events-none" })}>
        {label}
      </span>
      {fileName ? (
        <span className="max-w-full text-sm break-all">
          <span className="font-medium">{fileName}</span>
          <span className="text-muted-foreground"> · tap to change</span>
        </span>
      ) : (
        <span className="text-sm text-muted-foreground">{hint}</span>
      )}
      <input
        aria-label={ariaLabel}
        id={`${uid}-file`}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}
