import type { BaseUnit } from "@/lib/db/schema/enums";
import { formatMoney, formatQty, toDecimal } from "@/lib/units";

/**
 * The scheduled e-mails as subject, plain text and HTML (DECISIONS.md 99).
 * Pure, so they can be tested and previewed. Colours are inline hex values:
 * mail programs cannot read the app's CSS tokens. They mirror app/globals.css
 * (primary #2E7D4F, destructive #A32D2D, text #1F2A22, muted #5C5A52).
 */

const COLORS = { primary: "#2E7D4F", danger: "#A32D2D", text: "#1F2A22", muted: "#5C5A52", border: "#D9D4C7", page: "#F7F5F0" };

export type EmailMessage = { subject: string; text: string; html: string };

export type LowItem = { name: string; baseUnit: BaseUnit; stock: string; reorderPoint: string };
export type LossLine = { name: string; baseUnit: BaseUnit; differenceQty: string; differenceValue: string };

export type WeeklySummaryData = {
  restaurantName: string;
  /** "16 Nov – 22 Nov". */
  periodLabel: string;
  appUrl: string;
  countsApproved: number;
  /** Euros over the week's approved counts, opening counts left out. */
  unexplainedValue: string;
  topLosses: LossLine[];
  lowStock: LowItem[];
  /** Euros of waste logged in the week, at today's costs. */
  wasteValue: string;
  wasteEntries: number;
  deliveries: number;
  countsWaiting: number;
  needsRecipe: number;
};

export type LowStockData = { restaurantName: string; appUrl: string; items: LowItem[] };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function page(title: string, body: string, appUrl: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:${COLORS.page};font-family:Arial,Helvetica,sans-serif;color:${COLORS.text}">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:8px;padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>
${body}
<p style="margin:24px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${COLORS.primary};color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:6px">Open the app</a></p>
<p style="margin:16px 0 0;font-size:12px;color:${COLORS.muted}">Owners can turn these e-mails off in Settings.</p>
</div></body></html>`;
}

const money = (value: string) => {
  const negative = toDecimal(value).isNegative() && !toDecimal(value).isZero();
  return `<span style="color:${negative ? COLORS.danger : COLORS.text}">${escapeHtml(formatMoney(value))}</span>`;
};

function lowStockList(items: LowItem[]): { html: string; text: string } {
  const rows = items.map((item) => `${item.name}: ${formatQty(item.stock, item.baseUnit)} (reorder at ${formatQty(item.reorderPoint, item.baseUnit)})`);
  return {
    text: rows.map((row) => `- ${row}`).join("\n"),
    html: `<ul style="padding-left:20px;margin:8px 0">${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join("")}</ul>`,
  };
}

export function weeklySummaryEmail(data: WeeklySummaryData): EmailMessage {
  const headline =
    data.countsApproved === 0
      ? "No count was approved this week, so there is no unexplained usage to report."
      : `Unexplained usage from ${data.countsApproved} approved ${data.countsApproved === 1 ? "count" : "counts"}: ${formatMoney(data.unexplainedValue)}.`;
  const subject =
    data.countsApproved === 0
      ? `${data.restaurantName}: your week (${data.periodLabel})`
      : `${data.restaurantName}: ${formatMoney(data.unexplainedValue)} unexplained usage this week`;
  const losses = data.topLosses.map((line) => `${line.name}: ${formatMoney(line.differenceValue)} (${formatQty(line.differenceQty, line.baseUnit)})`);
  const low = lowStockList(data.lowStock);
  const waiting = [
    data.countsWaiting > 0 ? `${data.countsWaiting} ${data.countsWaiting === 1 ? "count waits" : "counts wait"} for approval` : null,
    data.needsRecipe > 0 ? `${data.needsRecipe} menu ${data.needsRecipe === 1 ? "item needs" : "items need"} a recipe` : null,
  ].filter((line): line is string => line !== null);
  const waste = `Waste logged: ${formatMoney(data.wasteValue)} in ${data.wasteEntries} ${data.wasteEntries === 1 ? "entry" : "entries"}. Deliveries logged: ${data.deliveries}.`;

  const text = [
    `${data.restaurantName}, ${data.periodLabel}`,
    "",
    headline,
    ...(losses.length > 0 ? ["", "Biggest losses:", ...losses.map((line) => `- ${line}`)] : []),
    "",
    data.lowStock.length > 0 ? "Low on stock:" : "Nothing is low on stock.",
    ...(data.lowStock.length > 0 ? [low.text] : []),
    "",
    waste,
    ...(waiting.length > 0 ? ["", "Waiting for you:", ...waiting.map((line) => `- ${line}`)] : []),
    "",
    data.appUrl,
  ].join("\n");

  const html = page(
    `${data.restaurantName}: your week`,
    `<p style="margin:0 0 4px;color:${COLORS.muted}">${escapeHtml(data.periodLabel)}</p>
<p style="margin:0 0 16px">${data.countsApproved === 0 ? escapeHtml(headline) : `Unexplained usage from ${data.countsApproved} approved ${data.countsApproved === 1 ? "count" : "counts"}: <strong>${money(data.unexplainedValue)}</strong>.`}</p>
${
  losses.length > 0
    ? `<h2 style="font-size:16px;margin:16px 0 4px">Biggest losses</h2><ul style="padding-left:20px;margin:8px 0">${data.topLosses
        .map((line) => `<li>${escapeHtml(line.name)}: ${money(line.differenceValue)} (${escapeHtml(formatQty(line.differenceQty, line.baseUnit))})</li>`)
        .join("")}</ul>`
    : ""
}
<h2 style="font-size:16px;margin:16px 0 4px">Stock</h2>
${data.lowStock.length > 0 ? `<p style="margin:0">Low on stock:</p>${low.html}` : `<p style="margin:0">Nothing is low on stock.</p>`}
<p style="margin:16px 0 0">${escapeHtml(waste)}</p>
${waiting.length > 0 ? `<h2 style="font-size:16px;margin:16px 0 4px">Waiting for you</h2><ul style="padding-left:20px;margin:8px 0">${waiting.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}`,
    data.appUrl,
  );
  return { subject, text, html };
}

export function lowStockEmail(data: LowStockData): EmailMessage {
  const count = data.items.length;
  const subject = `${data.restaurantName}: ${count} ${count === 1 ? "ingredient is" : "ingredients are"} low`;
  const low = lowStockList(data.items);
  const text = [`${data.restaurantName}`, "", "These are at or below their reorder point:", low.text, "", data.appUrl].join("\n");
  const html = page(subject, `<p style="margin:0">These are at or below their reorder point:</p>${low.html}`, data.appUrl);
  return { subject, text, html };
}
