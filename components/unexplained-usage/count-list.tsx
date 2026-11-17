import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { listApprovedCounts } from "@/lib/variance";
import { formatMoney } from "@/lib/units";
import { amountTone } from "@/components/amount-tone";
import { cn } from "@/lib/utils";

type ApprovedCount = Awaited<ReturnType<typeof listApprovedCounts>>[number];

export function CountList({ counts, timezone }: { counts: ApprovedCount[]; timezone: string }) {
  const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const [latest] = counts;
  if (!latest) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{formatter.format(latest.submittedAt)}</p>
            <p className="text-lg font-semibold md:text-xl">
              Last count: <span className={cn("tabular-nums", amountTone(latest.totalValue, { emphasis: true }))}>{formatMoney(latest.totalValue)}</span> of
              unexplained usage
            </p>
          </div>
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href={`/unexplained-usage/${latest.sessionId}`}>See details</Link>
          </Button>
        </CardContent>
      </Card>

      {/* Phone: stacked cards. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {counts.map((count) => (
          <li key={count.sessionId}>
            <Link
              href={`/unexplained-usage/${count.sessionId}`}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors hover:bg-row-hover active:bg-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-primary">{formatter.format(count.submittedAt)}</span>
                <span className="mt-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {count.lineCount} {count.lineCount === 1 ? "ingredient" : "ingredients"} counted
                  </span>
                  <span className={cn("tabular-nums", amountTone(count.totalValue, { emphasis: true }))}>
                    {formatMoney(count.totalValue)}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Count</TableHead>
              <TableHead className="text-right">Ingredients counted</TableHead>
              <TableHead className="text-right">Unexplained usage</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.map((count) => (
              <TableRow key={count.sessionId}>
                <TableCell className="font-medium">{formatter.format(count.submittedAt)}</TableCell>
                <TableCell className="text-right">{count.lineCount}</TableCell>
                <TableCell className={cn("text-right", amountTone(count.totalValue, { emphasis: true }))}>
                  {formatMoney(count.totalValue)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline">
                    <Link href={`/unexplained-usage/${count.sessionId}`}>See details</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
