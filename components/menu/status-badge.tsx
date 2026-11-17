import { Badge } from "@/components/ui/badge";
import { MENU_ITEM_STATUS_LABELS, menuItemStatus, type MenuItemStatus } from "@/lib/menu/status";

const VARIANT = { mapped: "success", unmapped: "warning", ignored: "neutral" } as const satisfies Record<
  MenuItemStatus,
  string
>;

/** Green when the item has a recipe, amber while it needs one, grey when ignored. */
export function StatusBadge({ item }: { item: { isMapped: boolean; isIgnored: boolean } }) {
  const status = menuItemStatus(item);
  return <Badge variant={VARIANT[status]}>{MENU_ITEM_STATUS_LABELS[status]}</Badge>;
}
