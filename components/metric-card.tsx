import { cn } from "@/lib/utils";

/**
 * One figure on a white, bordered card: the label in secondary text, the number
 * large below it. `tone` colours the number (for example red for a loss).
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
    <div className={cn("rounded-lg border border-border bg-card p-4 shadow-sm md:p-5", className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-3xl font-semibold tracking-tight tabular-nums", tone)}>{value}</p>
      {note ? <p className="mt-1 text-sm text-muted-foreground">{note}</p> : null}
    </div>
  );
}
