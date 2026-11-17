import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UnmappedQueueEntry } from "@/lib/menu";
import { formatNumber } from "@/lib/units";
import { IgnoreButton } from "./ignore-button";

function waiting(entry: UnmappedQueueEntry): string {
  if (entry.waitingLines === 0) return "Not sold yet";
  const lines = `${entry.waitingLines} ${entry.waitingLines === 1 ? "line" : "lines"}`;
  return `${lines}, ${formatNumber(entry.waitingQty)} sold`;
}

function Names({ entry }: { entry: UnmappedQueueEntry }) {
  return (
    <>
      <span className="font-medium">{entry.displayName}</span>
      {entry.displayName !== entry.posName ? (
        <span className="block text-sm font-normal text-muted-foreground">{entry.posName}</span>
      ) : null}
    </>
  );
}

export function UnmappedList({ entries, timezone }: { entries: UnmappedQueueEntry[]; timezone: string }) {
  const formatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const lastSold = (entry: UnmappedQueueEntry) => (entry.lastSoldAt ? formatter.format(entry.lastSoldAt) : "–");

  return (
    <>
      {/* Phone: stacked cards. */}
      <ul className="flex flex-col gap-3 md:hidden">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-xl border border-border-strong bg-card p-4 shadow-xs">
            <Names entry={entry} />
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Waiting sales</dt>
              <dd className="text-right">{waiting(entry)}</dd>
              <dt className="text-muted-foreground">Last sold</dt>
              <dd className="text-right">{lastSold(entry)}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="lg" className="flex-1">
                <Link href={`/menu/${entry.id}`}>Add recipe</Link>
              </Button>
              <IgnoreButton menuItemId={entry.id} name={entry.displayName} />
            </div>
          </li>
        ))}
      </ul>

      {/* Tablet and up: table. */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Waiting sales</TableHead>
              <TableHead>Last sold</TableHead>
              <TableHead className="w-64" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <Names entry={entry} />
                </TableCell>
                <TableCell>{waiting(entry)}</TableCell>
                <TableCell>{lastSold(entry)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button asChild>
                      <Link href={`/menu/${entry.id}`}>Add recipe</Link>
                    </Button>
                    <IgnoreButton menuItemId={entry.id} name={entry.displayName} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
