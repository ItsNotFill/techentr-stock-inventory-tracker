import { Badge } from "@/components/ui/badge";
import type { CountSummary } from "@/lib/counts";

const LABELS: Record<CountSummary["status"], string> = {
  draft: "Draft",
  submitted: "Waiting for approval",
  approved: "Approved",
  rejected: "Rejected",
};

/** Grey while counting, amber while it waits for a manager, then green or red. */
const VARIANT = {
  draft: "neutral",
  submitted: "warning",
  approved: "success",
  rejected: "danger",
} as const satisfies Record<CountSummary["status"], string>;

export function CountStatusBadge({ status }: { status: CountSummary["status"] }) {
  return <Badge variant={VARIANT[status]}>{LABELS[status]}</Badge>;
}

export function countWho(count: { countedBy: string; countedByEmail?: string | null }, userId: string): string {
  if (count.countedBy === userId) return "You";
  return count.countedByEmail ?? "A team member";
}
