import { toDecimal } from "@/lib/units";

export type AmountToneOptions = {
  /**
   * Semibold for the figure a row or card is about. Applies to non-zero
   * amounts only: zero always stays at normal weight.
   */
  emphasis?: boolean;
};

/**
 * Text classes for an amount (euros or a quantity), from its decimal string:
 * - negative: red (`text-destructive`), stock that went missing or money lost;
 * - zero: muted grey at normal weight (`font-normal`), so "€0.00" and "0 g"
 *   step back and the non-zero lines stand out;
 * - positive: plain foreground.
 *
 * Combine it with `cn()` and let it come last, rather than adding a weight of
 * your own: `cn("text-right", amountTone(value, { emphasis: true }))`. Then
 * zero is never bold, even inside a bold container.
 *
 * Pass the value at the precision it is shown with (lib/variance already
 * returns money to 2 decimals and quantities to 3), so a figure that reads
 * "€0.00" is never red. Uses decimal.js through `toDecimal`, never a JS number.
 */
export function amountTone(value: string, options: AmountToneOptions = {}): string {
  const amount = toDecimal(value);
  // Checked first: "-0" is negative to decimal.js but reads as zero.
  if (amount.isZero()) return "text-muted-foreground font-normal";
  const colour = amount.isNegative() ? "text-destructive" : "text-foreground";
  return options.emphasis ? `${colour} font-semibold` : colour;
}
