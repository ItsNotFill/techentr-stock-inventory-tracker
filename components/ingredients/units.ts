import type { BaseUnit } from "@/lib/units";

export const BASE_UNIT_LABELS: Record<BaseUnit, string> = {
  g: "Grams (g)",
  ml: "Millilitres (ml)",
  unit: "Pieces (unit)",
};

/** The larger unit a person usually thinks in: kg for g, l for ml. */
export const DEFAULT_DISPLAY_UNIT: Record<BaseUnit, string> = {
  g: "kg",
  ml: "l",
  unit: "unit",
};

/**
 * Inputs and selects are already 44 px on a phone and 40 px from `md` up
 * (components/ui); these only keep the screens that pass them consistent.
 */
export const CONTROL_HEIGHT = "h-11 text-base md:h-10 md:text-sm";
export const SELECT_HEIGHT = "w-full";
