import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatQty, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";
import type { CountReport } from "@/lib/variance";
import { ReviewActions } from "./review-actions";

function tone(value: string, muted = false): string {
  if (muted) return "text-muted-foreground";
  const decimal = toDecimal(value);
  return decimal.isNegative() && !decimal.isZero() ? "text-destructive" : "";
}

/** The manager's view of a submitted count: counted against expected, in units and euros. */
export function CountReview({ report, submittedText, byYou }: { report: CountReport; submittedText: string | null; byYou: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-xl border border-border-strong bg-card p-4 shadow-xs md:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            Submitted{submittedText ? ` on ${submittedText}` : ""}
            {byYou ? " by you" : ""}.
          </p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", tone(report.totalValue))}>
            Unexplained usage: {formatMoney(report.totalValue)}
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Expected is what sales, deliveries and waste say should be on the shelf. Approving sets stock to what was counted.
          </p>
        </div>
        <ReviewActions sessionId={report.sessionId} />
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {report.lines.map((line) => (
          <li key={line.lineId} className="rounded-xl border border-border-strong bg-card p-4 shadow-xs">
            <p className="font-semibold break-words">{line.ingredientName}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Counted</dt>
              <dd className="text-right">{formatQty(line.countedQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Expected</dt>
              <dd className="text-right">
                {line.isOpening ? <Badge variant="info">First count</Badge> : formatQty(line.expectedQty, line.baseUnit)}
              </dd>
              <dt className="text-muted-foreground">Difference</dt>
              <dd className={cn("text-right", tone(line.differenceQty, line.isOpening))}>{formatQty(line.differenceQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Difference in euros</dt>
              <dd className={cn("text-right font-medium", tone(line.differenceValue, line.isOpening))}>{formatMoney(line.differenceValue)}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Difference in euros</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.lines.map((line) => (
              <TableRow key={line.lineId}>
                <TableCell className="font-medium">{line.ingredientName}</TableCell>
                <TableCell className="text-right">{formatQty(line.countedQty, line.baseUnit)}</TableCell>
                <TableCell className="text-right">
                  {line.isOpening ? <Badge variant="info">First count</Badge> : formatQty(line.expectedQty, line.baseUnit)}
                </TableCell>
                <TableCell className={cn("text-right", tone(line.differenceQty, line.isOpening))}>{formatQty(line.differenceQty, line.baseUnit)}</TableCell>
                <TableCell className={cn("text-right font-medium", tone(line.differenceValue, line.isOpening))}>{formatMoney(line.differenceValue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
