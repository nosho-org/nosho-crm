import {
  getPeriodBuckets,
  getPeriodChoices,
  getPeriodFilter,
  isWithinPeriod,
  resolvePeriod,
} from "./dealPeriods";
import { toISODateString } from "./dealDates";

const NOW = new Date(2026, 7, 20); // 20 August 2026 — Q3, second semester

const range = (id: Parameters<typeof resolvePeriod>[0]) => {
  const period = resolvePeriod(id, NOW);
  return [
    period.start ? toISODateString(period.start) : null,
    period.end ? toISODateString(period.end) : null,
  ];
};

describe("resolvePeriod", () => {
  it("resolves month, quarter, semester and year around the reference date", () => {
    expect(range("current-month")).toEqual(["2026-08-01", "2026-08-31"]);
    expect(range("next-month")).toEqual(["2026-09-01", "2026-09-30"]);
    expect(range("current-quarter")).toEqual(["2026-07-01", "2026-09-30"]);
    expect(range("next-quarter")).toEqual(["2026-10-01", "2026-12-31"]);
    expect(range("current-semester")).toEqual(["2026-07-01", "2026-12-31"]);
    expect(range("current-year")).toEqual(["2026-01-01", "2026-12-31"]);
  });

  it("applies no bound on 'all'", () => {
    expect(range("all")).toEqual([null, null]);
  });

  it("rolls over the year end", () => {
    const december = new Date(2026, 11, 15);
    expect(toISODateString(resolvePeriod("next-month", december).start!)).toBe(
      "2027-01-01",
    );
    expect(
      toISODateString(resolvePeriod("next-quarter", december).start!),
    ).toBe("2027-01-01");
  });

  it("labels periods in French with the resolved range", () => {
    expect(resolvePeriod("current-quarter", NOW).label).toBe(
      "Trimestre en cours (T3 2026)",
    );
    expect(resolvePeriod("current-semester", NOW).label).toBe(
      "Semestre en cours (S2 2026)",
    );
    expect(resolvePeriod("current-month", NOW).label).toBe(
      "Mois en cours (Août 2026)",
    );
    expect(getPeriodChoices(NOW)).toHaveLength(7);
  });
});

describe("getPeriodFilter", () => {
  it("bounds the query on the expected closing date, and nothing else", () => {
    expect(getPeriodFilter(resolvePeriod("current-quarter", NOW))).toEqual({
      "expected_closing_date@gte": "2026-07-01",
      "expected_closing_date@lte": "2026-09-30",
    });
  });

  it("sends no bound at all on 'all'", () => {
    expect(getPeriodFilter(resolvePeriod("all", NOW))).toEqual({});
  });
});

describe("isWithinPeriod", () => {
  const quarter = resolvePeriod("current-quarter", NOW);

  it("includes both bounds", () => {
    expect(isWithinPeriod("2026-07-01", quarter)).toBe(true);
    expect(isWithinPeriod("2026-09-30", quarter)).toBe(true);
    expect(isWithinPeriod("2026-06-30", quarter)).toBe(false);
    expect(isWithinPeriod("2026-10-01", quarter)).toBe(false);
  });

  it("excludes deals with no date, and includes everything on 'all'", () => {
    expect(isWithinPeriod(null, quarter)).toBe(false);
    expect(isWithinPeriod(null, resolvePeriod("all", NOW))).toBe(false);
    expect(isWithinPeriod("2020-01-01", resolvePeriod("all", NOW))).toBe(true);
  });
});

describe("getPeriodBuckets", () => {
  it("splits a quarter into its three months", () => {
    const buckets = getPeriodBuckets(
      resolvePeriod("current-quarter", NOW),
      "month",
      NOW,
    );
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "Juillet 2026",
      "Août 2026",
      "Septembre 2026",
    ]);
    expect(toISODateString(buckets[0].start)).toBe("2026-07-01");
    expect(toISODateString(buckets[2].end)).toBe("2026-09-30");
  });

  it("splits a year into quarters", () => {
    const buckets = getPeriodBuckets(
      resolvePeriod("current-year", NOW),
      "quarter",
      NOW,
    );
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "T1 2026",
      "T2 2026",
      "T3 2026",
      "T4 2026",
    ]);
  });

  it("caps the number of columns to keep the table readable", () => {
    const buckets = getPeriodBuckets(
      resolvePeriod("current-year", NOW),
      "month",
      NOW,
    );
    expect(buckets).toHaveLength(12);
  });

  it("falls back to the current year when no period is selected", () => {
    const buckets = getPeriodBuckets(resolvePeriod("all", NOW), "quarter", NOW);
    expect(buckets.map((bucket) => bucket.label)).toEqual([
      "T1 2026",
      "T2 2026",
      "T3 2026",
      "T4 2026",
    ]);
  });
});
