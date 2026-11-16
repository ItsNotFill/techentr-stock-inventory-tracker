/**
 * Stage 0 check: both database URLs connect and the test table exists.
 * Run with: npx tsx scripts/check-db.ts
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local", quiet: true });

async function check(label: string, url: string | undefined, prepare: boolean) {
  if (!url) throw new Error(`Missing ${label}`);
  const sql = postgres(url, { prepare, max: 1 });
  try {
    const [row] = await sql<{ version: string; role: string; table_exists: boolean; rls: boolean }[]>`
      select
        current_setting('server_version') as version,
        current_user as role,
        to_regclass('public.setup_check') is not null as table_exists,
        coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.setup_check')), false) as rls
    `;
    console.log(
      `${label}: connected as ${row.role}, Postgres ${row.version}, setup_check exists: ${row.table_exists}, RLS on: ${row.rls}`,
    );
    if (!row.table_exists || !row.rls) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

async function main() {
  await check("DATABASE_URL (transaction pooler, app)", process.env.DATABASE_URL, false);
  await check("DATABASE_URL_MIGRATIONS (session pooler)", process.env.DATABASE_URL_MIGRATIONS, true);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
