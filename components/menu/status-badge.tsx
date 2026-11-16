import { Badge } from "@/components/ui/badge";
import { MENU_ITEM_STATUS_LABELS, menuItemStatus } from "@/lib/menu/status";

/** "Needs recipe" stands out; the other two are quiet. */
export function StatusBadge({ item }: { item: { isMapped: boolean; isIgnored: boolean } }) {
  const status = menuItemStatus(item);
  const variant = status === "unmapped" ? "destructive" : status === "mapped" ? "default" : "secondary";
  return <Badge variant={variant}>{MENU_ITEM_STATUS_LABELS[status]}</Badge>;
}
