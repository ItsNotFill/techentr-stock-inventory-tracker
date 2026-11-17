import Link from "next/link";
import { formatDateTime, plural } from "@/components/import/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CountSummary } from "@/lib/counts";
import { CountStatusBadge, countWho } from "./status-badge";

function when(count: CountSummary, timeZone: string): string {
  return formatDateTime(count.submittedAt ?? count.startedAt, timeZone);
}

/** Submitted counts for owners and managers to review. */
export function WaitingList({ counts, userId, timeZone }: { counts: CountSummary[]; userId: string; timeZone: string }) {
  if (counts.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing is waiting for approval.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {counts.map((count) => (
        <li key={count.id}>
          <Link href={`/count/${count.id}`} className="flex min-h-14 items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
            <span className="min-w-0">
              <span className="block break-words font-medium">{countWho(count, userId)}</span>
              <span className="block text-sm text-muted-foreground">
                Submitted {when(count, timeZone)} · {plural(count.lineCount, "ingredient", "ingredients")}
              </span>
            </span>
            <span className="shrink-0 text-sm font-medium text-primary">Review</span>
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
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No counts yet.</p>;
  }
  const usageLink = (count: CountSummary) =>
    canManage && count.status === "approved" ? (
      <Link href={`/unexplained-usage/${count.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        See unexplained usage
      </Link>
    ) : null;
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {counts.map((count) => (
          <li key={count.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/count/${count.id}`} className="min-w-0">
                <span className="block break-words font-medium">{countWho(count, userId)}</span>
                <span className="block text-sm text-muted-foreground">{when(count, timeZone)}</span>
              </Link>
              <CountStatusBadge status={count.status} />
            </div>
            {count.status === "rejected" && count.reviewNote ? (
              <p className="mt-2 break-words text-sm text-muted-foreground">Note: {count.reviewNote}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Link href={`/count/${count.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                Open
              </Link>
              {usageLink(count)}
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
                <TableCell className="max-w-64 truncate">{count.status === "rejected" ? (count.reviewNote ?? "") : ""}</TableCell>
                <TableCell className="text-right">{count.lineCount}</TableCell>
                <TableCell className="space-x-4 text-right whitespace-nowrap">
                  <Link href={`/count/${count.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Open
                  </Link>
                  {usageLink(count)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
