import { FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ImportHistoryEntry } from "@/lib/imports";
import { formatDateTime } from "./format";
import { UndoButton } from "./undo-button";

function StatusBadge({ status }: { status: ImportHistoryEntry["status"] }) {
  if (status === "undone") return <Badge variant="neutral">Undone</Badge>;
  if (status === "confirmed") return <Badge variant="success">Imported</Badge>;
  return <Badge variant="neutral">Draft</Badge>;
}

/** Past imports: a table from `md` up, cards on a phone. */
export function ImportHistory({ imports, timeZone }: { imports: ImportHistoryEntry[]; timeZone: string }) {
  if (imports.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="No imports yet"
        description="Choose a CSV file above. Each file you import is listed here, and you can undo it."
      />
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {imports.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{entry.fileName ?? "Unnamed file"}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(entry.createdAt, timeZone)}</p>
              </div>
              <StatusBadge status={entry.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm tabular-nums">
              <dt className="text-muted-foreground">Lines imported</dt>
              <dd className="text-right">{entry.rowCount}</dd>
              <dt className="text-muted-foreground">Orders skipped</dt>
              <dd className="text-right">{entry.skippedCount}</dd>
              <dt className="text-muted-foreground">Waiting for recipe</dt>
              <dd className="text-right">{entry.unmappedCount}</dd>
            </dl>
            {entry.status === "confirmed" ? (
              <div className="mt-3">
                <UndoButton importId={entry.id} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>File</TableHead>
              <TableHead className="text-right">Lines imported</TableHead>
              <TableHead className="text-right">Orders skipped</TableHead>
              <TableHead className="text-right">Waiting for recipe</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(entry.createdAt, timeZone)}</TableCell>
                <TableCell className="max-w-64 truncate">{entry.fileName ?? "Unnamed file"}</TableCell>
                <TableCell className="text-right">{entry.rowCount}</TableCell>
                <TableCell className="text-right">{entry.skippedCount}</TableCell>
                <TableCell className="text-right">{entry.unmappedCount}</TableCell>
                <TableCell>
                  <StatusBadge status={entry.status} />
                </TableCell>
                <TableCell className="text-right">
                  {entry.status === "confirmed" ? <UndoButton importId={entry.id} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
