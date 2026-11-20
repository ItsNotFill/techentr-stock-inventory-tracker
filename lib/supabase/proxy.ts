import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "./public-env";

/** Paths anyone may open. Everything else needs a signed-in user. */
const PUBLIC_PATHS = ["/", "/login", "/sign-up", "/~offline"];
// /api/cron/ checks its own secret (lib/email/cron.ts); it has no signed-in user.
const PUBLIC_PREFIXES = ["/auth/", "/api/health", "/api/cron/"];
/** Signed-in users are sent away from these to the app. */
const SIGNED_OUT_ONLY = ["/login", "/sign-up"];

/**
 * Refreshes the Supabase session cookie and does the optimistic redirects.
 * This is a convenience, not the security boundary: every page, Server Action
 * and query checks the user again, and RLS has the last word.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, publishableKey } = supabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Do not put code between creating the client and this call: it is what
  // refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!signedIn && !isPublic) {
    return redirectKeepingCookies(request, response, "/login");
  }
  if (signedIn && SIGNED_OUT_ONLY.includes(pathname)) {
    return redirectKeepingCookies(request, response, "/dashboard");
  }
  return response;
}

function redirectKeepingCookies(request: NextRequest, from: NextResponse, pathname: string): NextResponse {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  const redirect = NextResponse.redirect(target);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
