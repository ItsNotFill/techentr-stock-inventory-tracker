/**
 * Postgres error helpers. Drizzle wraps the driver's error, so the code is
 * looked for on the error and down its `cause` chain.
 */
function postgresCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Two people saved the same thing at the same moment and a unique index refused the second. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505";
}

/** A row is still referenced by another table (ON DELETE RESTRICT). */
export function isForeignKeyViolation(error: unknown): boolean {
  return postgresCode(error) === "23503";
}
