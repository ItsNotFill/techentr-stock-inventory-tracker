"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { amountTone } from "@/components/amount-tone";
import type { TopUnexplained } from "@/lib/dashboard";
import { formatMoney, formatQty, toDecimal } from "@/lib/units";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 44;
const AXIS_HEIGHT = 36;
const MAX_LABEL = 16;

type Row = TopUnexplained & {
  /** Euros lost as a plain number: used only to draw the bar's length. Every printed figure comes from the strings. */
  lost: number;
};

function shortName(name: string): string {
  return name.length > MAX_LABEL ? `${name.slice(0, MAX_LABEL - 1)}…` : name;
}

/** The text of one line, the same in the tooltip and in the table: "−€4.00 · −500 g". */
function lineText(row: TopUnexplained): string {
  return `${formatMoney(row.differenceValue)} · ${formatQty(row.differenceQty, row.baseUnit)}`;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{row.ingredientName}</p>
      <p className="tabular-nums text-destructive">{lineText(row)}</p>
    </div>
  );
}

/**
 * The ingredients with the most euros lost in the last approved count, as
 * horizontal bars (Recharts). A small table under the chart lists the same
 * lines, so the figures can be read without the picture.
 */
export function TopUnexplainedChart({ top }: { top: TopUnexplained[] }) {
  // Recharts draws numbers; they only set the bar length (the biggest loss first).
  const rows: Row[] = top.map((line) => ({ ...line, lost: Number(toDecimal(line.differenceValue).abs().toFixed(2)) }));
  const summary = top.map((line) => `${line.ingredientName} ${lineText(line)}`).join("; ");

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="top-unexplained-title">
      <h2 id="top-unexplained-title" className="text-base font-semibold">
        Top 5 unexplained usage, last count
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No unexplained losses in the last count</p>
      ) : (
        <>
          <div role="img" aria-label={`Bar chart of euros lost per ingredient: ${summary}`} style={{ height: rows.length * ROW_HEIGHT + AXIS_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: rows.length * ROW_HEIGHT + AXIS_HEIGHT }}>
              <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
                <CartesianGrid horizontal={false} stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="lost"
                  tickFormatter={(value: number) => formatMoney(String(value))}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                  stroke="var(--border)"
                  allowDecimals
                />
                <YAxis
                  type="category"
                  dataKey="ingredientName"
                  width={112}
                  tickFormatter={shortName}
                  tick={{ fill: "var(--foreground)", fontSize: 13 }}
                  stroke="var(--border)"
                  interval={0}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--row-hover)" }} />
                <Bar dataKey="lost" fill="var(--destructive)" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">Euros lost and units missing per ingredient, last count</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Ingredient</th>
                <th scope="col">Euros lost</th>
                <th scope="col">Units missing</th>
              </tr>
            </thead>
            <tbody>
              {top.map((line) => (
                <tr key={line.ingredientId} className="border-t border-border first:border-t-0">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium break-words">
                    {line.ingredientName}
                  </th>
                  <td className={cn("py-1.5 text-right", amountTone(line.differenceValue))}>{formatMoney(line.differenceValue)}</td>
                  <td className="py-1.5 pl-3 text-right text-muted-foreground">{formatQty(line.differenceQty, line.baseUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
