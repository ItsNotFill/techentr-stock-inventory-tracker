import "server-only";

/**
 * Server-side environment variables. Read lazily, so a missing value fails
 * at the call that needs it and not at build time.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const serverEnv = {
  /** Transaction pooler (port 6543). The app's run-time connection. */
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  /** Supabase secret key. Never import this into browser code. */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
  get aiModel() {
    return process.env.AI_MODEL || "claude-sonnet-5-5";
  },
};
