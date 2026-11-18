/**
 * Wall-clock time in a restaurant's timezone -> the UTC instant.
 * POS exports give local times with no offset ("16/11/2026 19:30"); the
 * database stores UTC. These are calendar numbers, not quantities, so plain
 * JS numbers are fine here.
 */

export type LocalDateTime = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** How far the zone is ahead of UTC at that instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant;
}

/** True when the fields name a real calendar date and time (no 31 February, no 25:00). */
export function isValidLocalDateTime(local: LocalDateTime): boolean {
  const { year, month, day, hour, minute, second } = local;
  if (![year, month, day, hour, minute, second].every(Number.isInteger)) return false;
  if (year < 2000 || year > 2100 || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/**
 * The UTC instant of a local date and time in an IANA timezone. Around a
 * clock change, a time that does not exist is moved forward by the gap, and
 * a time that occurs twice takes the first occurrence.
 */
export function zonedTimeToUtc(local: LocalDateTime, timeZone: string): Date {
  const wallClock = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  // First guess with the offset at the wall-clock value read as UTC, then
  // correct with the offset at the guess: two passes settle clock changes.
  const firstGuess = wallClock - offsetAt(wallClock, timeZone);
  const secondGuess = wallClock - offsetAt(firstGuess, timeZone);
  return new Date(secondGuess);
}

/** The calendar date ("2026-11-16") of an instant in a timezone. */
export function localDateOf(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * The value of an `<input type="datetime-local">` ("2026-11-18T09:30",
 * seconds optional) as a local date and time, or null when it is not one.
 */
export function parseDateTimeInput(value: string): LocalDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second = "0"] = match.slice(1);
  const local = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: Number(second),
  };
  return isValidLocalDateTime(local) ? local : null;
}

/** An instant as an `<input type="datetime-local">` value in a timezone: "2026-11-18T09:30". */
export function toDateTimeInput(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
