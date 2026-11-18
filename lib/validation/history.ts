import { z } from "zod";
import { movementType, type MovementType } from "@/lib/db/schema/enums";
import { zonedTimeToUtc } from "@/lib/imports/time";

/**
 * The stock history screen's filters, read from the URL
 * (`/history?ingredient=<id>&type=delivery&from=2026-11-01&to=2026-11-16`).
 * Anything that does not parse is dropped, so a hand-edited URL shows the
 * unfiltered history instead of an error.
 */

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  sale: "Sale",
  delivery: "Delivery",
  waste: "Waste",
  count_adjust: "Count adjustment",
};

const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 2000 && year <= 2100 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });

const first = (value: unknown) => (Array.isArray(value) ? value[0] : value);

export const historySearchSchema = z.object({
  ingredient: z.preprocess(first, z.uuid().optional()).catch(undefined),
  type: z.preprocess(first, z.enum(movementType.enumValues).optional()).catch(undefined),
  from: z.preprocess(first, calendarDate.optional()).catch(undefined),
  to: z.preprocess(first, calendarDate.optional()).catch(undefined),
});

export type HistorySearch = z.infer<typeof historySearchSchema>;

function startOfDay(date: string, timeZone: string, addDays = 0): Date {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + addDays));
  return zonedTimeToUtc(
    { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(), hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

/**
 * From and to calendar days (both included) in the restaurant's timezone as
 * instants: `from` is the start of the first day, `before` the start of the
 * day after the last. A range given backwards is turned round.
 */
export function historyRange(search: Pick<HistorySearch, "from" | "to">, timeZone: string): { from?: Date; before?: Date } {
  let { from, to } = search;
  if (from && to && from > to) [from, to] = [to, from];
  return {
    from: from ? startOfDay(from, timeZone) : undefined,
    before: to ? startOfDay(to, timeZone, 1) : undefined,
  };
}
