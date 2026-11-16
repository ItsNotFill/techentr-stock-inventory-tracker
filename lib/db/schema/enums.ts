import { pgEnum } from "drizzle-orm/pg-core";

// All enums from SCHEMA.md. They are created together in stage 1 so that later
// migrations only add tables.

export const memberRole = pgEnum("member_role", ["owner", "manager", "staff"]);
export const baseUnit = pgEnum("base_unit", ["g", "ml", "unit"]);
export const menuItemKind = pgEnum("menu_item_kind", ["item", "modifier"]);
export const recipeLineSource = pgEnum("recipe_line_source", ["manual", "ai"]);
export const movementType = pgEnum("movement_type", ["sale", "delivery", "waste", "count_adjust"]);
export const wasteReason = pgEnum("waste_reason", ["expired", "dropped", "burnt", "other"]);
export const importSource = pgEnum("import_source", ["csv", "photo"]);
export const importStatus = pgEnum("import_status", ["draft", "confirmed", "undone"]);
export const countStatus = pgEnum("count_status", ["draft", "submitted", "approved", "rejected"]);
export const deliverySource = pgEnum("delivery_source", ["manual", "invoice_photo"]);
export const deliveryStatus = pgEnum("delivery_status", ["draft", "confirmed", "discarded"]);
export const aiExtractionKind = pgEnum("ai_extraction_kind", [
  "menu_screenshot",
  "recipe_draft",
  "eod_report",
  "supplier_invoice",
]);
export const aiExtractionStatus = pgEnum("ai_extraction_status", ["draft", "confirmed", "discarded", "failed"]);

export type MemberRole = (typeof memberRole.enumValues)[number];
export type BaseUnit = (typeof baseUnit.enumValues)[number];
