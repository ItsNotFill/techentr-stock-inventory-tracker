import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { EmailFrame } from "@/components/settings/email-frame";
import { PageHeader } from "@/components/page-header";
import { CardsSkeleton } from "@/components/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/membership";
import { OWNER_ROLES } from "@/lib/auth/roles";
import { withUser } from "@/lib/db/client";
import { appUrl } from "@/lib/email/send";
import { previewEmail } from "@/lib/email/settings";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "E-mail preview" };

const KINDS = [
  { kind: "weekly_summary", label: "Weekly summary" },
  { kind: "low_stock", label: "Low-stock alert" },
] as const;

export default function EmailPreviewPage({ searchParams }: PageProps<"/settings/emails/preview">) {
  return (
    <>
      <PageHeader
        title="E-mail preview"
        description="What the e-mail would look like if it went out now."
        back={{ href: "/settings", label: "Settings" }}
      />
      <Suspense fallback={<CardsSkeleton cards={2} />}>
        <PreviewContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PreviewContent({
  searchParams,
}: {
  searchParams: PageProps<"/settings/emails/preview">["searchParams"];
}) {
  const membership = await requireRole(OWNER_ROLES);
  const { kind: rawKind } = await searchParams;
  const kind = rawKind === "low_stock" ? "low_stock" : "weekly_summary";
  const email = await withUser((tx) => previewEmail(tx, membership.locationId, kind, new Date(), appUrl()));

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <nav aria-label="E-mail kind" className="flex flex-wrap gap-2">
        {KINDS.map((item) => (
          <Link
            key={item.kind}
            href={`/settings/emails/preview?kind=${item.kind}`}
            aria-current={item.kind === kind ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              item.kind === kind
                ? "border-primary bg-accent text-primary"
                : "border-border bg-card text-foreground hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {email === null ? (
        <EmptyState
          icon={MailCheck}
          title="Nothing is low on stock, so no alert would go out today."
          description="The alert is only sent when an ingredient is at or below its reorder point."
        >
          <Button variant="outline" size="lg" asChild>
            <Link href="/settings">Back to Settings</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">Subject</p>
              <p className="text-sm font-medium break-words">{email.subject}</p>
            </CardContent>
          </Card>
          <EmailFrame html={email.html} />
          <details className="max-w-[640px] rounded-lg border border-border bg-card px-4 py-3">
            <summary className="min-h-11 cursor-pointer py-2.5 text-sm leading-6 font-medium text-primary">Plain-text version</summary>
            <pre className="mt-3 text-sm break-words whitespace-pre-wrap text-foreground">{email.text}</pre>
          </details>
        </>
      )}
    </div>
  );
}
