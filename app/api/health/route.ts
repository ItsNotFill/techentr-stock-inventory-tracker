import { connection } from "next/server";

/**
 * Public health check, for whoever runs the deployment:
 *   GET /api/health
 * Says which commit is live, which Supabase address the build uses (masked:
 * enough to see the domain, not the project), and whether Supabase answers.
 * No secrets: the Supabase URL is public by design (NEXT_PUBLIC_).
 */
export async function GET() {
  await connection();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    host = "";
  }
  const masked = host ? host.replace(/^([^.]{3})[^.]*/, "$1***") : "(missing or not a URL)";

  let reachable = false;
  let detail = "";
  if (host) {
    try {
      const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      reachable = response.ok;
      detail = `HTTP ${response.status}`;
    } catch (error) {
      detail = error instanceof Error ? `${error.name}: ${error.message}` : "request failed";
    }
  }

  return Response.json(
    {
      ok: reachable,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
      supabase: { address: masked, endsWithSupabaseCo: host.endsWith(".supabase.co"), reachable, detail },
    },
    { status: reachable ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
