/** Date and time in the restaurant's timezone, e.g. "16 Nov 2026, 12:05". */
export function formatDateTime(value: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
    typeof value === "string" ? new Date(value) : value,
  );
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
