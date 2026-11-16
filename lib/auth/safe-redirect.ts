/**
 * Where to send someone after an e-mail link, given the `next` value from the
 * URL. `next` is attacker-controlled, and "is this a path on our site" is
 * surprisingly hard to answer by parsing: browsers drop tabs and newlines
 * ("/\t/evil.com"), and dot segments normalise into "//evil.com".
 *
 * So nothing is parsed. The links this app creates only ever lead to the
 * screens below; `next` must be exactly one of them, or it is ignored.
 */
export const REDIRECT_TARGETS = ["/dashboard", "/onboarding", "/set-password"] as const;

export type RedirectTarget = (typeof REDIRECT_TARGETS)[number];

export function safeRedirectPath(next: string | null | undefined, fallback: RedirectTarget = "/dashboard"): RedirectTarget {
  const match = REDIRECT_TARGETS.find((target) => target === next);
  return match ?? fallback;
}
