import "server-only";

/**
 * Sending e-mail through Resend's HTTP API (DECISIONS.md 99). Server only:
 * the key never reaches a browser. Without RESEND_API_KEY and EMAIL_FROM
 * there is no sender, and the jobs log their e-mails as skipped.
 */

export type OutgoingEmail = { to: string; subject: string; text: string; html: string };
export type EmailSender = (email: OutgoingEmail) => Promise<void>;

/** True when both the key and the sender address are set. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** The sender for this deployment, or null when e-mail is not set up yet. */
export function defaultSender(): EmailSender | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  return apiKey && from ? resendSender(apiKey, from) : null;
}

export function resendSender(apiKey: string, from: string): EmailSender {
  const post = (email: OutgoingEmail) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(15_000),
    });
  return async (email) => {
    let response = await post(email);
    // Resend allows a few calls a second; one e-mail per recipient can go over it. Wait once and retry.
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      response = await post(email);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new Error(`The e-mail service answered ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  };
}

/** The app's address for links in e-mails: APP_URL, else Vercel's production domain, else local. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
