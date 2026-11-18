import { CircleHelp, ClipboardList } from "lucide-react";
import Link from "next/link";
import { amountTone } from "@/components/amount-tone";
import { formatDateTime, plural } from "@/components/import/format";
import { MetricCard, MetricGrid } from "@/components/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Dashboard } from "@/lib/dashboard";
import { formatMoney } from "@/lib/units";

const textLink = "font-medium underline underline-offset-4 hover:no-underline";
const MUTED = "text-muted-foreground font-normal";

/** The three headline figures for owners and managers. */
export function DashboardMetrics({ data, timeZone }: { data: Dashboard; timeZone: string }) {
  const { lastCount, lastImport, lowStock } = data;
  return (
    <MetricGrid>
      <MetricCard
        label="Unexplained usage, last count"
        value={lastCount ? formatMoney(lastCount.totalValue) : "–"}
        tone={lastCount ? amountTone(lastCount.totalValue, { emphasis: true }) : MUTED}
        note={
          lastCount ? (
            <Link
              href={`/unexplained-usage/${lastCount.sessionId}`}
              className="rounded-sm text-primary underline-offset-4 hover:text-primary-hover hover:underline"
            >
              Counted {formatDateTime(lastCount.submittedAt, timeZone)}
            </Link>
          ) : (
            "No approved count yet"
          )
        }
      />
      <MetricCard
        label="Low stock"
        value={lowStock.length}
        tone={lowStock.length > 0 ? "text-warning-foreground" : MUTED}
        note={lowStock.length > 0 ? "At or below the reorder point" : "Nothing is low"}
      />
      <MetricCard
        label="Last import"
        value={lastImport ? formatDateTime(lastImport.createdAt, timeZone) : "–"}
        tone={lastImport ? "text-lg lg:text-xl" : MUTED}
        note={
          lastImport
            ? `${plural(lastImport.rowCount, "line", "lines")} · ${lastImport.skippedCount} skipped · ${lastImport.unmappedCount} waiting for a recipe`
            : "No sales imported yet"
        }
      />
    </MetricGrid>
  );
}

/** Short notices, only when something needs a manager. */
export function DashboardNotices({ needsRecipe, countsWaiting }: { needsRecipe: number; countsWaiting: number }) {
  if (needsRecipe === 0 && countsWaiting === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {needsRecipe > 0 ? (
        <Alert variant="warning">
          <CircleHelp aria-hidden />
          <AlertDescription>
            <Link href="/unmapped" className={textLink}>
              {plural(needsRecipe, "item needs", "items need")} a recipe
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      {countsWaiting > 0 ? (
        <Alert variant="warning">
          <ClipboardList aria-hidden />
          <AlertDescription>
            <Link href="/count" className={textLink}>
              {plural(countsWaiting, "count is", "counts are")} waiting for approval
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
