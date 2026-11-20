import { localDateOf } from "@/lib/imports/time";

/**
 * Period keys for the e-mail log (DECISIONS.md 99): one weekly summary per ISO
 * week and one low-stock alert per day at most, both in the restaurant's
 * timezone. Calendar numbers, not quantities: plain numbers are fine here.
 */

/** "2026-11-20" in the restaurant's timezone. */
export function dayKey(instant: Date, timeZone: string): string {
  return localDateOf(instant, timeZone);
}

/** "2026-W47": the ISO week (Monday first; week 1 holds the year's first Thursday) of the local date. */
export function isoWeekKey(instant: Date, timeZone: string): string {
  const [year, month, day] = localDateOf(instant, timeZone).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7; // Monday 1 ... Sunday 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday); // the Thursday of this week decides the year
  const weekYear = date.getUTCFullYear();
  const firstDay = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil(((date.getTime() - firstDay.getTime()) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

/** Which ingredients are low, as a stable text: the next alert goes only when it changes. */
export function lowStockSignature(ingredientIds: string[]): string {
  return [...ingredientIds].sort().join(",");
}
