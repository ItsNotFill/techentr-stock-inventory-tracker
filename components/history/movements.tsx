import Link from "next/link";
import { amountTone } from "@/components/amount-tone";
import { formatDateTime } from "@/components/import/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BaseUnit } from "@/lib/db/schema/enums";
import type { HistoryRow } from "@/lib/ledger/history";
import { formatQty, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";
import { MOVEMENT_TYPE_LABELS } from "@/lib/validation/history";
import { WASTE_REASON_LABELS } from "@/lib/validation/stock-entry";

const LATE_MS = 5 * 60_000;
const textLink = "font-medium text-primary underline-offset-4 hover:text-primary-hover hover:underline";

/** "+5,000 g" or "−4,400 g": the sign is always shown. */
export function signedQty(value: string, baseUnit: BaseUnit): string {
  const text = formatQty(value, baseUnit);
  const amount = toDecimal(value);
  return amount.isPositive() && !amount.isZero() ? `+${text}` : text;
}

function Details({ row }: { row: HistoryRow }) {
  const { source } = row;
  const lines: React.ReactNode[] = [];
  if (row.isCorrection) {
    lines.push(
      <span key="correction">
        Correction: a movement dated before this count was recorded after it was approved
        {source?.kind === "count" ? (
          <>
            {" · "}
            <Link href={`/unexplained-usage/${source.sessionId}`} className={textLink}>
              Count
            </Link>
          </>
        ) : null}
      </span>,
    );
  } else if (source?.kind === "sale") {
    lines.push(
      <span key="sale">
        <Link href="/import" className={textLink}>
          Order {source.posOrderId}
        </Link>
        {source.menuItemName ? ` · ${source.menuItemName}` : ""}
      </span>,
    );
    if (source.fileName) {
      lines.push(
        <span key="file" className="text-muted-foreground">
          {source.fileName}
        </span>,
      );
    }
  } else if (source?.kind === "delivery") {
    lines.push(<span key="delivery">{source.supplierName ? `From ${source.supplierName}` : "Delivery"}</span>);
  } else if (source?.kind === "count") {
    lines.push(
      <Link key="count" href={`/unexplained-usage/${source.sessionId}`} className={textLink}>
        {source.isOpening ? "Opening count" : "Count"}
      </Link>,
    );
  } else if (row.type === "waste" && row.wasteReason) {
    lines.push(<span key="reason">{WASTE_REASON_LABELS[row.wasteReason]}</span>);
  }
  // A correction's own note (written by the database) says the same as the line above.
  if (row.note && !row.isCorrection) {
    lines.push(
      <span key="note" className={lines.length > 0 ? "text-muted-foreground" : undefined}>
        {row.note}
      </span>,
    );
  }
  if (lines.length === 0) return <span className="text-muted-foreground">–</span>;
  return (
    <span className="flex flex-col gap-0.5 break-words">
      {lines.map((line, index) => (
        <span key={index}>{line}</span>
      ))}
    </span>
  );
}

function When({ row, timeZone }: { row: HistoryRow; timeZone: string }) {
  const late = row.createdAt.getTime() - row.occurredAt.getTime() > LATE_MS;
  return (
    <span className="flex flex-col">
      <span>{formatDateTime(row.occurredAt, timeZone)}</span>
      {late ? (
        <span className="text-xs text-muted-foreground">recorded {formatDateTime(row.createdAt, timeZone)}</span>
      ) : null}
    </span>
  );
}

/** Movements newest first: one card per movement on a phone, a table from `md` up. */
export function Movements({ rows, baseUnit, timeZone }: { rows: HistoryRow[]; baseUnit: BaseUnit; timeZone: string }) {
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{MOVEMENT_TYPE_LABELS[row.type]}</p>
                <div className="text-muted-foreground">
                  <When row={row} timeZone={timeZone} />
                </div>
              </div>
              <p className={cn("shrink-0 text-right text-lg font-semibold tabular-nums", amountTone(row.qtyDelta, { emphasis: true }))}>
                {signedQty(row.qtyDelta, baseUnit)}
              </p>
            </div>
            <div className="text-sm">
              <Details row={row} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2 text-sm text-muted-foreground">
              <span className="min-w-0 break-all">{row.createdByEmail ?? "–"}</span>
              <span className="shrink-0 tabular-nums">Stock after {formatQty(row.stockAfter, baseUnit)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right">Stock after</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="align-top">
                  <When row={row} timeZone={timeZone} />
                </TableCell>
                <TableCell className="align-top">{MOVEMENT_TYPE_LABELS[row.type]}</TableCell>
                <TableCell className={cn("text-right align-top tabular-nums", amountTone(row.qtyDelta))}>
                  {signedQty(row.qtyDelta, baseUnit)}
                </TableCell>
                <TableCell className="text-right align-top tabular-nums">{formatQty(row.stockAfter, baseUnit)}</TableCell>
                <TableCell className="max-w-72 align-top whitespace-normal">
                  <Details row={row} />
                </TableCell>
                <TableCell className="align-top break-all whitespace-normal text-muted-foreground">
                  {row.createdByEmail ?? "–"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
