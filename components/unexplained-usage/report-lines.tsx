import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney, formatQty, formatUnitCost, toDecimal } from "@/lib/units";
import type { ReportLine } from "@/lib/variance";
import { amountTone } from "./tone";

function Name({ line }: { line: ReportLine }) {
  return (
    <>
      <span className="font-medium text-foreground">{line.ingredientName}</span>
      {line.isOpening ? (
        <Badge variant="neutral" className="ml-2 align-middle">
          First count
        </Badge>
      ) : null}
      {line.storageArea ? (
        <span className="block text-sm font-normal text-muted-foreground">{line.storageArea}</span>
      ) : null}
    </>
  );
}

function LateNote({ line }: { line: ReportLine }) {
  if (toDecimal(line.lateAdjustQty).isZero()) return null;
  return <span className="block text-xs text-muted-foreground">includes changes recorded after the count</span>;
}

export function ReportLines({ lines }: { lines: ReportLine[] }) {
  const hasOpening = lines.some((line) => line.isOpening);
  return (
    <>
      {/* Phone: one card per ingredient. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {lines.map((line) => (
          <li
            key={line.lineId}
            className={`rounded-lg border bg-card p-4 shadow-sm ${line.isOpening ? "border-border" : "border-border"}`}
          >
            <Name line={line} />
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Expected</dt>
              <dd className="text-right">
                {formatQty(line.expectedQty, line.baseUnit)}
                <LateNote line={line} />
              </dd>
              <dt className="text-muted-foreground">Counted</dt>
              <dd className="text-right">{formatQty(line.countedQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Difference</dt>
              <dd className={`text-right ${amountTone(line.differenceQty)}`}>{formatQty(line.differenceQty, line.baseUnit)}</dd>
              <dt className="text-muted-foreground">Difference in €</dt>
              <dd className={`text-right font-semibold ${amountTone(line.differenceValue)}`}>{formatMoney(line.differenceValue)}</dd>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Cost used: {formatUnitCost(line.unitCost, line.baseUnit)}
            </p>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Counted</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Difference in €</TableHead>
              <TableHead className="text-right">Cost used</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.lineId} className={line.isOpening ? "text-muted-foreground" : undefined}>
                <TableCell>
                  <Name line={line} />
                </TableCell>
                <TableCell className="text-right">
                  {formatQty(line.expectedQty, line.baseUnit)}
                  <LateNote line={line} />
                </TableCell>
                <TableCell className="text-right">{formatQty(line.countedQty, line.baseUnit)}</TableCell>
                <TableCell className={`text-right ${amountTone(line.differenceQty)}`}>
                  {formatQty(line.differenceQty, line.baseUnit)}
                </TableCell>
                <TableCell className={`text-right font-semibold ${amountTone(line.differenceValue)}`}>
                  {formatMoney(line.differenceValue)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatUnitCost(line.unitCost, line.baseUnit)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasOpening ? (
        <p className="text-sm text-muted-foreground">
          First counts set the starting stock and are not unexplained usage.
        </p>
      ) : null}
    </>
  );
}
