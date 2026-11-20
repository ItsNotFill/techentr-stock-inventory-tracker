import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/db/admin";
import { cronRefusal } from "@/lib/email/cron";
import { runWeeklySummaries } from "@/lib/email/jobs";
import { appUrl, defaultSender } from "@/lib/email/send";

/** Vercel Cron, Mondays (vercel.json): the weekly owner summary of every location (DECISIONS.md 99). */
export async function GET(request: Request) {
  const refusal = cronRefusal(request);
  if (refusal) return refusal;
  const result = await runWeeklySummaries(getAdminDb(), { now: new Date(), send: defaultSender(), appUrl: appUrl() });
  return NextResponse.json({ ok: true, ...result });
}
