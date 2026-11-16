import { config } from "dotenv";

// Integration tests talk to the real database. Values come from .env.local;
// tests that need them skip themselves when they are missing.
config({ path: ".env.local", quiet: true });

const needed = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"];
const missing = needed.filter((name) => !process.env[name]);
if (missing.length > 0) {
  const message = `Database tests need ${missing.join(", ")} in .env.local.`;
  // Set REQUIRE_DATABASE_TESTS=1 (for example in CI) to fail instead of skipping.
  if (process.env.REQUIRE_DATABASE_TESTS === "1") throw new Error(message);
  console.warn(`\nWARNING: ${message} The integration tests, including the stage done checks, are SKIPPED.\n`);
}
