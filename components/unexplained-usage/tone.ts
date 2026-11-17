import { toDecimal } from "@/lib/units";

/** Red for a loss, muted for zero, plain for a positive amount. */
export function amountTone(value: string): string {
  const amount = toDecimal(value);
  if (amount.isNegative() && !amount.isZero()) return "text-destructive";
  if (amount.isZero()) return "text-muted-foreground";
  return "";
}
