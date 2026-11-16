// Safe to import from Client Components.

export type MenuItemStatus = "mapped" | "unmapped" | "ignored";

/**
 * mapped: has a confirmed recipe, so sales deplete stock.
 * ignored: uses no stock (service charge, gift card).
 * unmapped: neither; it waits in the unmapped queue.
 */
export function menuItemStatus(item: { isMapped: boolean; isIgnored: boolean }): MenuItemStatus {
  if (item.isIgnored) return "ignored";
  return item.isMapped ? "mapped" : "unmapped";
}

export const MENU_ITEM_STATUS_LABELS: Record<MenuItemStatus, string> = {
  mapped: "Has recipe",
  unmapped: "Needs recipe",
  ignored: "Ignored",
};
