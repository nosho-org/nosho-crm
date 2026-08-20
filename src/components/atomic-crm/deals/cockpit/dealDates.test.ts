import {
  daysSince,
  daysUntil,
  parseISODateLocal,
  startOfToday,
  toISODateString,
} from "./dealDates";

/**
 * These assertions are written as timezone-*invariants* rather than by
 * emulating a timezone: `commands.setTimezone` (the CDP override wired up in
 * `vitest.config.ts`) does not survive the session detach in headless Chromium,
 * so a test that switched timezones would silently assert nothing. Each
 * invariant below must hold whatever timezone the suite runs in.
 */
describe("parseISODateLocal", () => {
  it("round-trips a date-only value, so it never lands on the day before", () => {
    // The bug this guards: `new Date("2026-08-01")` is UTC midnight, which is
    // 31 July for any negative offset. Round-tripping through the local-time
    // serializer only holds if the value was parsed in local time too.
    for (const value of [
      "2026-01-01",
      "2026-03-29", // DST spring forward in Europe
      "2026-08-01",
      "2026-10-25", // DST fall back in Europe
      "2026-12-31",
    ]) {
      expect(toISODateString(parseISODateLocal(value)!)).toBe(value);
    }
  });

  it("builds a date-only value from its literal components", () => {
    const date = parseISODateLocal("2026-08-01")!;
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      2026, 7, 1,
    ]);
    expect(date.getHours()).toBe(0);
  });

  it("truncates a timestamptz to its own local day", () => {
    const value = "2026-08-19T23:30:00.000Z";
    const asDate = new Date(value);
    const parsed = parseISODateLocal(value)!;
    // Whatever the offset, the parsed day is the local day of that instant.
    expect(parsed.getDate()).toBe(asDate.getDate());
    expect(parsed.getMonth()).toBe(asDate.getMonth());
    expect(parsed.getFullYear()).toBe(asDate.getFullYear());
    expect(parsed.getHours()).toBe(0);
  });

  it("returns null on missing or malformed input", () => {
    expect(parseISODateLocal(null)).toBeNull();
    expect(parseISODateLocal(undefined)).toBeNull();
    expect(parseISODateLocal("")).toBeNull();
    expect(parseISODateLocal("pas une date")).toBeNull();
  });
});

describe("toISODateString", () => {
  it("serializes a local date without shifting it", () => {
    expect(toISODateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toISODateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("startOfToday", () => {
  it("truncates to local midnight", () => {
    const start = startOfToday(new Date(2026, 7, 20, 18, 45));
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(20);
  });
});

describe("daysSince / daysUntil", () => {
  const today = new Date(2026, 7, 20);

  it("counts whole calendar days in both directions", () => {
    expect(daysSince("2026-08-06", today)).toBe(14);
    expect(daysSince("2026-08-20", today)).toBe(0);
    expect(daysUntil("2026-08-25", today)).toBe(5);
    expect(daysUntil("2026-08-18", today)).toBe(-2);
  });

  it("counts calendar days, not 24-hour spans, across a DST change", () => {
    // Europe switches on 25 October 2026; that day is 25 hours long there.
    expect(daysSince("2026-10-24", new Date(2026, 9, 26))).toBe(2);
  });

  it("returns null — never 0 — when the date is unknown", () => {
    expect(daysSince(null, today)).toBeNull();
    expect(daysUntil(undefined, today)).toBeNull();
  });
});
