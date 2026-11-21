"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { setEmailSettingsAction } from "@/app/(app)/settings/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

/** When an e-mail last ran, with the date already formatted in the restaurant's timezone. */
export type LastRun = {
  status: "sent" | "skipped" | "failed";
  date: string;
  recipientCount: number;
  error: string | null;
} | null;

function LastRunText({ run }: { run: LastRun }) {
  if (!run) return <p className="text-xs text-muted-foreground">Not sent yet</p>;
  if (run.status === "sent") {
    return (
      <p className="text-xs text-muted-foreground">
        Last sent {run.date} to {run.recipientCount} {run.recipientCount === 1 ? "person" : "people"}
      </p>
    );
  }
  if (run.status === "skipped") {
    return (
      <p className="text-xs text-muted-foreground">
        Last run {run.date}: not sent{run.error ? ` (${run.error})` : ""}
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Badge variant="danger">Failed</Badge>
      <span>
        {run.date}
        {run.error ? `: ${run.error}` : ""}
      </span>
    </p>
  );
}

/**
 * The two scheduled e-mails: an owner switches each on or off (saved at once)
 * and sees when it last ran. Preview links go to the preview screen.
 */
export function EmailCard({
  weeklySummary: initialWeekly,
  lowStockAlerts: initialLow,
  lastWeeklySummary,
  lastLowStockAlert,
  configured,
}: {
  weeklySummary: boolean;
  lowStockAlerts: boolean;
  lastWeeklySummary: LastRun;
  lastLowStockAlert: LastRun;
  configured: boolean;
}) {
  const uid = useId();
  const [weekly, setWeekly] = useState(initialWeekly);
  const [low, setLow] = useState(initialLow);
  const [saving, startSaving] = useTransition();

  function save(next: { weeklySummary: boolean; lowStockAlerts: boolean }) {
    const before = { weeklySummary: weekly, lowStockAlerts: low };
    setWeekly(next.weeklySummary);
    setLow(next.lowStockAlerts);
    startSaving(async () => {
      const result = await setEmailSettingsAction(next);
      if (result.ok) {
        toast.success(result.message ?? "E-mail settings saved.");
      } else {
        setWeekly(before.weeklySummary);
        setLow(before.lowStockAlerts);
        toast.error(result.message ?? "Could not save the e-mail settings.");
      }
    });
  }

  const rows = [
    {
      id: `${uid}-weekly`,
      label: "Weekly summary",
      description: "Unexplained usage, top losses, what is low and what waits for you. Owners, every Monday.",
      checked: weekly,
      last: lastWeeklySummary,
      onChange: (checked: boolean) => save({ weeklySummary: checked, lowStockAlerts: low }),
    },
    {
      id: `${uid}-low`,
      label: "Low-stock alerts",
      description:
        "What is at or below its reorder point. Owners and managers, at most once a day, only when the list changes.",
      checked: low,
      last: lastLowStockAlert,
      onChange: (checked: boolean) => save({ weeklySummary: weekly, lowStockAlerts: checked }),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>E-mails</CardTitle>
        <CardDescription>
          Sent from the app on a schedule: the weekly summary to owners on Monday morning, the low-stock alert to
          owners and managers when what is low changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {configured ? null : (
          <Alert>
            <AlertDescription>
              E-mail is not set up yet, so nothing is sent. Runs are still recorded, and you can preview the e-mails.
            </AlertDescription>
          </Alert>
        )}
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((row) => (
            <li key={row.id} className="flex min-h-14 items-start justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={row.id} className="text-sm font-medium">
                  {row.label}
                </label>
                <p className="text-sm text-muted-foreground">{row.description}</p>
                <LastRunText run={row.last} />
              </div>
              <Switch
                id={row.id}
                checked={row.checked}
                disabled={saving}
                onCheckedChange={row.onChange}
                className="mt-0.5"
              />
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" asChild>
            <Link href="/settings/emails/preview?kind=weekly_summary">Preview weekly summary</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/settings/emails/preview?kind=low_stock">Preview low-stock alert</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
