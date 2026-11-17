import { Skeleton } from "@/components/ui/skeleton";

/** Suspense fallback for a screen whose content is a table or list. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Suspense fallback for a screen made of cards. */
export function CardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: cards }, (_, index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  );
}
