import { Badge } from "@/components/ui/badge";
import type { CountSummary } from "@/lib/counts";

const LABELS: Record<CountSummary["status"], string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
};

export function CountStatusBadge({ status }: { status: CountSummary["status"] }) {
  const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : status === "submitted" ? "secondary" : "outline";
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}

export function countWho(count: { countedBy: string; countedByEmail?: string | null }, userId: string): string {
  if (count.countedBy === userId) return "You";
  return count.countedByEmail ?? "A team member";
}
