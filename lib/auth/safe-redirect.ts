/**
 * Where to send someone after an e-mail link, given the `next` value from the
 * URL. Only paths on this site are accepted; anything else becomes `fallback`.
 *
 * `next` is attacker-controlled. Checking for a leading "/" is not enough:
 * browsers drop tabs and newlines and read "/\t/evil.com" as "//evil.com".
 * So the value must be made of plain path characters AND still resolve to
 * this origin.
 */
const SAFE_PATH = /^\/[A-Za-z0-9\-._~/?=&%]*$/;

export function safeRedirectPath(next: string | null | undefined, origin: string, fallback = "/dashboard"): string {
  if (!next || !SAFE_PATH.test(next) || next.startsWith("//")) return fallback;
  let resolved: URL;
  try {
    resolved = new URL(next, origin);
  } catch {
    return fallback;
  }
  if (resolved.origin !== new URL(origin).origin) return fallback;
  return `${resolved.pathname}${resolved.search}`;
}
