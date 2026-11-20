import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/db/admin";
import { cronRefusal } from "@/lib/email/cron";
import { runLowStockAlerts } from "@/lib/email/jobs";
import { appUrl, defaultSender } from "@/lib/email/send";

/** Vercel Cron, daily (vercel.json): low-stock alerts where what is low changed (DECISIONS.md 99). */
export async function GET(request: Request) {
  const refusal = cronRefusal(request);
  if (refusal) return refusal;
  const result = await runLowStockAlerts(getAdminDb(), { now: new Date(), send: defaultSender(), appUrl: appUrl() });
  return NextResponse.json({ ok: true, ...result });
}
