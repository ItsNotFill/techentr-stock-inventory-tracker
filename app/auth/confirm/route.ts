import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/** Only same-site paths, so the link cannot be used to send people elsewhere. */
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value;
  }
  return "/dashboard";
}

/**
 * Where the links in Supabase's e-mails land (sign-up confirmation, invite).
 * Handles both link styles: `?code=` (the default template) and
 * `?token_hash=&type=` (a custom template).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const supabase = await createSupabaseServerClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let confirmed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    confirmed = !error;
    // Opened on another device than the one that signed up: the address is
    // confirmed, but there is no session here. Ask them to log in.
    if (error) {
      return NextResponse.redirect(new URL("/login?notice=confirmed", request.url));
    }
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    confirmed = !error;
  }

  if (!confirmed) {
    return NextResponse.redirect(new URL("/login?notice=link-failed", request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
