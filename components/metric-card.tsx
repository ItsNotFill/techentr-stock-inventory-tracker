import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One figure on a white, bordered card: the label in secondary text, the number
 * below it. `tone` colours the number; for an amount pass
 * `amountTone(value)` from `@/components/amount-tone` (red for a loss, muted and
 * not bold for zero).
 *
 * Compact on a phone (12 px padding, 24 px number) so a row of them does not
 * push the page down; roomier from `sm`, and a 30 px number from `lg`. A
 * number too wide for its card wraps instead of spilling over the border.
 * Put cards in a `MetricGrid`.
 */
export function MetricCard({
  label,
  value,
  tone,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  tone?: string;
  /** A short line under the number. */
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4 lg:p-5",
        className
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tracking-tight break-words tabular-nums lg:text-3xl",
          tone
        )}
      >
        {value}
      </p>
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}

/**
 * Lays out MetricCards. While the grid is narrow (a phone) two cards share a
 * row, and with an odd number of cards the first, the headline figure, takes
 * the whole first row: three cards fill two short rows. Once the grid is at
 * least 36rem (576 px) wide, every card sits in one row, one column each, at
 * most three columns.
 *
 * It measures its own width, not the window's (a container query): on a
 * tablet with the sidebar open the content area is only about 450 px, and
 * three columns there would squeeze the numbers. On a phone and on a desktop
 * it behaves like `grid-cols-2` / `sm:grid-cols-3`.
 *
 * `className` and other props go on the outer element (for margins, an
 * `aria-label`).
 */
export function MetricGrid({ children, className, ...props }: React.ComponentProps<"div">) {
  const count = React.Children.toArray(children).length;
  if (count === 0) return null;

  return (
    <div className={cn("@container", className)} {...props}>
      <div
        className={cn(
          "grid gap-3 md:gap-4",
          count === 1 ? "grid-cols-1" : "grid-cols-2",
          count >= 3 && "@min-[36rem]:grid-cols-3",
          count >= 3 &&
            count % 2 === 1 &&
            "[&>*:first-child]:col-span-2 @min-[36rem]:[&>*:first-child]:col-span-1"
        )}
      >
        {children}
      </div>
    </div>
  );
}
