import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ReportLines } from "@/components/unexplained-usage/report-lines";
import { amountTone } from "@/components/unexplained-usage/tone";
import { requireRole } from "@/lib/auth/membership";
import { MANAGER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { formatMoney } from "@/lib/units";
import { idSchema } from "@/lib/validation/ingredients";
import { getCountReport } from "@/lib/variance";

export const metadata: Metadata = { title: "Count report" };

export default function CountReportPage({ params }: PageProps<"/unexplained-usage/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Unexplained usage" />
          <CardsSkeleton cards={3} />
        </>
      }
    >
      <CountReportContent params={params} />
    </Suspense>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

async function CountReportContent({ params }: { params: PageProps<"/unexplained-usage/[id]">["params"] }) {
  const membership = await requireRole(MANAGER_ROLES);
  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const report = await withUser((tx) => getCountReport(tx, membership.locationId, parsedId.data));
  // Only approved counts have a report; anything else is "not found" here.
  if (!report || report.status !== "approved" || !report.submittedAt) notFound();

  const when = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: membership.timezone,
  }).format(report.submittedAt);

  return (
    <>
      <PageHeader title={`Count of ${when}`} />
      <div className="flex flex-col gap-6">
        <Link
          href="/unexplained-usage"
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to unexplained usage
        </Link>
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard
            label="Unexplained usage"
            value={formatMoney(report.totalValue)}
            tone={amountTone(report.totalValue)}
          />
          <SummaryCard label="Lost" value={formatMoney(report.lostValue)} tone={amountTone(report.lostValue)} />
          <SummaryCard label="Ingredients counted" value={String(report.lines.length)} />
        </div>
        <p className="text-sm text-muted-foreground">
          Negative numbers are stock that is missing: used without a sale or waste record. Check portion sizes, recipes
          and waste logging first.
        </p>
        <ReportLines lines={report.lines} />
      </div>
    </>
  );
}
