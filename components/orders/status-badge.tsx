import { Badge } from "@/components/ui/badge";
import type { PurchaseOrderStatus } from "@/lib/db/schema/enums";

const LOOK: Record<PurchaseOrderStatus, { variant: "neutral" | "warning" | "success"; label: string }> = {
  draft: { variant: "neutral", label: "Draft" },
  sent: { variant: "warning", label: "Waiting for delivery" },
  received: { variant: "success", label: "Received" },
  cancelled: { variant: "neutral", label: "Cancelled" },
};

export function OrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const look = LOOK[status];
  return <Badge variant={look.variant}>{look.label}</Badge>;
}
