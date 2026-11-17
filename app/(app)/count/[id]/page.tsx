import { TrendingDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CountReview } from "@/components/count/count-review";
import { CountSheetForm } from "@/components/count/count-sheet";
import { CountedFigures } from "@/components/count/counted-figures";
import { CountStatusBadge } from "@/components/count/status-badge";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/components/import/format";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireMembership } from "@/lib/auth/membership";
import { canManage } from "@/lib/auth/roles";
import { getCountSheet } from "@/lib/counts";
import { withUser } from "@/lib/db/client";
import { getCountReport } from "@/lib/variance";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Count" };

const BACK = { href: "/count", label: "Back to counts" };

export default function CountDetailPage({ params }: PageProps<"/count/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Count" back={BACK} />
          <CardsSkeleton cards={3} />
        </>
      }
    >
      <CountDetail params={params} />
    </Suspense>
  );
}

async function CountDetail({ params }: { params: PageProps<"/count/[id]">["params"] }) {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success) notFound();
  const membership = await requireMembership();
  const sheet = await withUser((tx) => getCountSheet(tx, membership.locationId, parsed.data));
  if (!sheet) notFound();
  const manager = canManage(membership.role);
  const own = sheet.countedBy === membership.userId;
  const timeZone = membership.timezone;
  const badge = <CountStatusBadge status={sheet.status} />;

  if (sheet.status === "draft") {
    if (!own) {
      return (
        <>
          <PageHeader title="Count" back={BACK} badge={badge} />
          <EmptyState title="A team member is still counting." description="You can review the count once it is submitted." />
        </>
      );
    }
    // The person counting never gets the expected figures (they would steer the count).
    const ingredients = sheet.ingredients.map((ingredient) => ({ ...ingredient, theoreticalQty: null }));
    return (
      <>
        <PageHeader
          title="Count"
          back={BACK}
          badge={badge}
          description="Write down what is on the shelf. Each figure is saved when you leave the field."
        />
        <CountSheetForm sessionId={sheet.id} ingredients={ingredients} canApprove={manager} />
      </>
    );
  }

  const submittedText = sheet.submittedAt ? formatDateTime(sheet.submittedAt, timeZone) : null;

  if (sheet.status === "submitted") {
    if (!manager) {
      return (
        <>
          <PageHeader title="Count" back={BACK} badge={badge} />
          <div className="flex flex-col gap-6">
            <p className="text-base">Submitted on {submittedText}. Waiting for a manager to approve it.</p>
            <CountedFigures ingredients={sheet.ingredients} />
          </div>
        </>
      );
    }
    const report = await withUser((tx) => getCountReport(tx, membership.locationId, sheet.id));
    if (!report) notFound();
    return (
      <>
        <PageHeader
          title="Count"
          back={BACK}
          badge={badge}
          description="Check the differences, then approve the count or send it back."
        />
        <CountReview report={report} submittedText={submittedText} byYou={own} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Count"
        back={BACK}
        badge={badge}
        description={submittedText ? `Submitted on ${submittedText}` : undefined}
      >
        {sheet.status === "approved" && manager ? (
          <Button asChild size="lg">
            <Link href={`/unexplained-usage/${sheet.id}`}>
              <TrendingDown aria-hidden />
              See unexplained usage
            </Link>
          </Button>
        ) : null}
      </PageHeader>
      <div className="flex flex-col gap-6">
        {sheet.status === "rejected" ? (
          <p className="rounded-lg bg-danger p-4 text-sm text-danger-foreground">
            {sheet.reviewNote ? <>Note from the manager: {sheet.reviewNote}</> : "Rejected without a note."} Stock did not
            change.
          </p>
        ) : null}
        <CountedFigures ingredients={sheet.ingredients} />
      </div>
    </>
  );
}
