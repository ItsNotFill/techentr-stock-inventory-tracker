import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

// Migrations need a session, so they use the session pooler (port 5432),
// not the app's transaction pooler. See DECISIONS.md, entry 32.
const url = process.env.DATABASE_URL_MIGRATIONS;
if (!url) {
  throw new Error("Missing DATABASE_URL_MIGRATIONS. See .env.example.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  schemaFilter: ["public"],
  // Supabase owns its roles (anon, authenticated, ...); drizzle-kit must not manage them.
  entities: { roles: { provider: "supabase" } },
  strict: true,
  verbose: true,
});
