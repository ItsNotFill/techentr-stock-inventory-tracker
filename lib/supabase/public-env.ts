/**
 * The two Supabase values that may reach the browser. They are written out in
 * full so that Next.js can inline them into the client bundle.
 */
export function supabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.",
    );
  }
  return { url, publishableKey };
}
