import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What a screen shows when it has nothing to list: what is missing, one line on
 * what to do next, and the button that does it. `size="sm"` is a quieter
 * version for a section inside a screen.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  size = "default",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** The next step: usually one button. */
  children?: React.ReactNode;
  size?: "default" | "sm";
  className?: string;
}) {
  const small = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-card text-center",
        small ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
        className,
      )}
    >
      {Icon && !small ? (
        <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <Icon className="size-6" aria-hidden />
        </div>
      ) : null}
      <div className="flex max-w-md flex-col gap-1">
        <p className={cn("font-semibold text-foreground", small ? "text-sm" : "text-base")}>{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
