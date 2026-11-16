import { numeric, timestamp } from "drizzle-orm/pg-core";

// Column helpers for the conventions in SCHEMA.md. Drizzle returns numeric
// columns as strings: parse them with decimal.js, never with Number().

/** A quantity in base units (g, ml, unit). */
export const qty = (name: string) => numeric(name, { precision: 14, scale: 3 });

/** Cost per base unit in euros (EUR 8 per kg = 0.008000 per g). */
export const unitCost = (name: string) => numeric(name, { precision: 12, scale: 6 });

/** An amount of money in euros. */
export const money = (name: string) => numeric(name, { precision: 12, scale: 2 });

/** A UTC timestamp. Shown in the location's timezone on screen. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const createdAt = () => timestamptz("created_at").notNull().defaultNow();
export const updatedAt = () =>
  timestamptz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
