import { ChevronRight, ClipboardList } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime, plural } from "@/components/import/format";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountSummary } from "@/lib/counts";
import { StartCountButton } from "./start-count-button";
import { CountStatusBadge, countWho } from "./status-badge";

function when(count: CountSummary, timeZone: string): string {
  return formatDateTime(count.submittedAt ?? count.startedAt, timeZone);
}

const textLink = "text-sm font-medium text-primary underline-offset-4 hover:underline";

/** Submitted counts for owners and managers to review. */
export function WaitingList({ counts, userId, timeZone }: { counts: CountSummary[]; userId: string; timeZone: string }) {
  if (counts.length === 0) {
    return <EmptyState size="sm" title="Nothing is waiting for approval." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {counts.map((count) => (
        <li key={count.id}>
          <Link
            href={`/count/${count.id}`}
            className="group flex min-h-16 items-center justify-between gap-3 rounded-lg border border-warning-border bg-card p-4 shadow-sm transition-colors hover:border-primary hover:bg-row-hover"
          >
            <span className="min-w-0">
              <span className="block font-semibold break-words">{countWho(count, userId)}</span>
              <span className="block text-sm text-muted-foreground">
                Submitted {when(count, timeZone)} · {plural(count.lineCount, "ingredient", "ingredients")}
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">
              Review
              <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** All counts, newest first: cards on a phone, a table from `md` up. */
export function RecentCounts({
  counts,
  userId,
  timeZone,
  canManage,
}: {
  counts: CountSummary[];
  userId: string;
  timeZone: string;
  canManage: boolean;
}) {
  if (counts.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No counts yet"
        description="A count is a walk past the shelves, writing down what is there. It takes a few minutes on a phone."
      >
        <StartCountButton hasDraft={false} />
      </EmptyState>
    );
  }
  const showUsage = (count: CountSummary) => canManage && count.status === "approved";
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {counts.map((count) => (
          <li key={count.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/count/${count.id}`} className="min-w-0 rounded-sm">
                <span className="block font-semibold break-words">{countWho(count, userId)}</span>
                <span className="block text-sm text-muted-foreground">{when(count, timeZone)}</span>
              </Link>
              <CountStatusBadge status={count.status} />
            </div>
            {count.status === "rejected" && count.reviewNote ? (
              <p className="mt-2 text-sm break-words text-muted-foreground">Note: {count.reviewNote}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Link href={`/count/${count.id}`} className={buttonVariants({ variant: "outline", className: "flex-1" })}>
                Open
              </Link>
              {showUsage(count) ? (
                <Link
                  href={`/unexplained-usage/${count.id}`}
                  className={buttonVariants({ variant: "ghost", className: "flex-1" })}
                >
                  See unexplained usage
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Counted by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Ingredients</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.map((count) => (
              <TableRow key={count.id}>
                <TableCell className="whitespace-nowrap">{when(count, timeZone)}</TableCell>
                <TableCell>{countWho(count, userId)}</TableCell>
                <TableCell>
                  <CountStatusBadge status={count.status} />
                </TableCell>
                <TableCell className="max-w-64 truncate text-muted-foreground">
                  {count.status === "rejected" ? (count.reviewNote ?? "") : ""}
                </TableCell>
                <TableCell className="text-right">{count.lineCount}</TableCell>
                <TableCell className="space-x-4 text-right whitespace-nowrap">
                  <Link href={`/count/${count.id}`} className={textLink}>
                    Open
                  </Link>
                  {showUsage(count) ? (
                    <Link href={`/unexplained-usage/${count.id}`} className={textLink}>
                      See unexplained usage
                    </Link>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
