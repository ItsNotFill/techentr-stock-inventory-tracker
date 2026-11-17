import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CountReview } from "@/components/count/count-review";
import { CountSheetForm } from "@/components/count/count-sheet";
import { CountedFigures } from "@/components/count/counted-figures";
import { CountStatusBadge } from "@/components/count/status-badge";
import { formatDateTime } from "@/components/import/format";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { requireMembership } from "@/lib/auth/membership";
import { canManage } from "@/lib/auth/roles";
import { getCountSheet } from "@/lib/counts";
import { withUser } from "@/lib/db/client";
import { getCountReport } from "@/lib/variance";
import { idSchema } from "@/lib/validation/ingredients";

export const metadata: Metadata = { title: "Count" };

export default function CountDetailPage({ params }: PageProps<"/count/[id]">) {
  return (
    <>
      <PageHeader title="Count" />
      <Suspense fallback={<CardsSkeleton cards={3} />}>
        <CountDetail params={params} />
      </Suspense>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/count" className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
      Back to counts
    </Link>
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

  if (sheet.status === "draft") {
    if (!own) {
      return (
        <div className="flex flex-col gap-4">
          <BackLink />
          <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">A team member is still counting.</p>
        </div>
      );
    }
    // The person counting never gets the expected figures (they would steer the count).
    const ingredients = sheet.ingredients.map((ingredient) => ({ ...ingredient, theoreticalQty: null }));
    return <CountSheetForm sessionId={sheet.id} ingredients={ingredients} canApprove={manager} />;
  }

  const submittedText = sheet.submittedAt ? formatDateTime(sheet.submittedAt, timeZone) : null;

  if (sheet.status === "submitted") {
    if (!manager) {
      return (
        <div className="flex flex-col gap-6">
          <BackLink />
          <p className="text-base">Submitted on {submittedText}. Waiting for a manager to approve it.</p>
          <CountedFigures ingredients={sheet.ingredients} />
        </div>
      );
    }
    const report = await withUser((tx) => getCountReport(tx, membership.locationId, sheet.id));
    if (!report) notFound();
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        <CountReview report={report} submittedText={submittedText} byYou={own} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <div className="flex flex-wrap items-center gap-3">
        <CountStatusBadge status={sheet.status} />
        {submittedText ? <span className="text-sm text-muted-foreground">Submitted on {submittedText}</span> : null}
      </div>
      {sheet.status === "rejected" ? (
        <p className="rounded-xl border bg-card p-4 text-sm">
          {sheet.reviewNote ? <>Note from the manager: {sheet.reviewNote}</> : "Rejected without a note."} Stock did not change.
        </p>
      ) : null}
      {sheet.status === "approved" && manager ? (
        <Link href={`/unexplained-usage/${sheet.id}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          See unexplained usage
        </Link>
      ) : null}
      <CountedFigures ingredients={sheet.ingredients} />
    </div>
  );
}
