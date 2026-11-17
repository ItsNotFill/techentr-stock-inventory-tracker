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
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          Submitted{submittedText ? ` on ${submittedText}` : ""}
          {byYou ? " by you" : ""}.
        </p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", tone(report.totalValue))}>
          Unexplained usage: {formatMoney(report.totalValue)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Expected is what sales, deliveries and waste say should be on the shelf. Approving sets stock to what was counted.
        </p>
      </div>

      <ReviewActions sessionId={report.sessionId} />

      <ul className="flex flex-col gap-3 md:hidden">
        {report.lines.map((line) => (
          <li key={line.lineId} className="rounded-xl border bg-card p-4">
            <p className="break-words font-medium">{line.ingredientName}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Counted</dt>
              <dd className="text-right">{formatQty(line.countedQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Expected</dt>
              <dd className="text-right">{line.isOpening ? "First count" : formatQty(line.expectedQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Difference</dt>
              <dd className={cn("text-right", tone(line.differenceQty, line.isOpening))}>{formatQty(line.differenceQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Difference in euros</dt>
              <dd className={cn("text-right", tone(line.differenceValue, line.isOpening))}>{formatMoney(line.differenceValue)}</dd>
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
                <TableCell>{line.ingredientName}</TableCell>
                <TableCell className="text-right">{formatQty(line.countedQty, line.baseUnit)}</TableCell>
                <TableCell className="text-right">
                  {line.isOpening ? <span className="text-muted-foreground">First count</span> : formatQty(line.expectedQty, line.baseUnit)}
                </TableCell>
                <TableCell className={cn("text-right", tone(line.differenceQty, line.isOpening))}>{formatQty(line.differenceQty, line.baseUnit)}</TableCell>
                <TableCell className={cn("text-right", tone(line.differenceValue, line.isOpening))}>{formatMoney(line.differenceValue)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
