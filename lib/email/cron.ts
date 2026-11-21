import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

/**
 * Vercel Cron calls the cron routes with `Authorization: Bearer <CRON_SECRET>`
 * (DECISIONS.md 99). Returns a response to send back when the call is not
 * allowed, or null when it is. Without CRON_SECRET the routes refuse every call.
 */
export function cronRefusal(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Scheduled jobs are not set up (CRON_SECRET is missing)." }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  return null;
}
