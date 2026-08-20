import { commands } from "vitest/browser";

import {
  formatDealMeetingDate,
  formatISODateString,
  getCompanyTypeChoices,
  getCustomViewCompanyType,
  getDefaultDealStage,
} from "./dealUtils";

describe("formatISODateString", () => {
  let originalTimezone: string;

  beforeEach(() => {
    originalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  afterEach(async () => {
    await commands.setTimezone(originalTimezone);
  });

  it("formats a valid ISO date string correctly", () => {
    const isoDate = "2024-06-15";
    const formattedDate = formatISODateString(isoDate);
    expect(formattedDate).toBe("Jun 15, 2024");
  });

  it("should not shift the date regardless of timezone", async () => {
    // Uses CDP (Emulation.setTimezoneOverride) to actually change the browser's
    // timezone at runtime so we can catch regressions where someone replaces the
    // manual date-component parse with new Date(isoString), which would shift
    // dates in negative-offset timezones like America/New_York.
    const isoDate = "2024-06-15";
    await commands.setTimezone("America/New_York");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Asia/Tokyo");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("UTC");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");

    await commands.setTimezone("Pacific/Auckland");
    expect(formatISODateString(isoDate)).toBe("Jun 15, 2024");
  });

  it("throw for an invalid date string", () => {
    const invalidDate = "invalid-date";
    expect(() => formatISODateString(invalidDate)).toThrow(
      "Invalid date format. Expected YYYY-MM-DD.",
    );
  });

  it("throw for a date string with wrong format", () => {
    const invalidDate = "15-06-2024";
    expect(() => formatISODateString(invalidDate)).toThrow(
      "Invalid date format. Expected YYYY-MM-DD.",
    );
  });
});

describe("getDefaultDealStage", () => {
  const dealStages = [
    { value: "lead", label: "Lead" },
    { value: "qualified", label: "Qualifié" },
    { value: "closed-won", label: "Gagné" },
  ];

  it("uses the first visible stage for a custom view", () => {
    expect(getDefaultDealStage(dealStages, ["qualified", "closed-won"])).toBe(
      "qualified",
    );
  });

  it("falls back to the first configured stage when visible stages are missing or stale", () => {
    expect(getDefaultDealStage(dealStages, ["opportunity"])).toBe("lead");
    expect(getDefaultDealStage(dealStages)).toBe("lead");
  });
});

describe("getCompanyTypeChoices", () => {
  it("shows custom view labels as destinations and falls back to static choices", () => {
    expect(
      getCompanyTypeChoices(
        [
          { value: "prospect", label: "Prospect" },
          { value: "client", label: "Client" },
        ],
        [
          {
            id: "view-hot",
            label: "Leads chauds",
            companyType: "leads-chauds",
          },
          {
            id: "view-prospect",
            label: "Prospects prioritaires",
            companyType: "prospect",
          },
        ],
      ),
    ).toEqual([
      { value: "leads-chauds", label: "Leads chauds" },
      { value: "prospect", label: "Prospects prioritaires" },
      { value: "client", label: "Client" },
    ]);
  });

  it("gives old lead views dedicated destinations even when they were created from the same company type", () => {
    const customViews = [
      {
        id: "view-hot",
        label: "Leads chauds",
        companyType: "prospect",
      },
      {
        id: "view-cold",
        label: "Leads froids",
        companyType: "prospect",
      },
      {
        id: "view-referral",
        label: "Referral",
        companyType: "prospect",
      },
    ];

    expect(getCustomViewCompanyType(customViews[0], customViews)).toBe(
      "leads-chauds",
    );
    expect(getCustomViewCompanyType(customViews[1], customViews)).toBe(
      "leads-froids",
    );
    expect(getCustomViewCompanyType(customViews[2], customViews)).toBe(
      "referral",
    );
    expect(
      getCompanyTypeChoices(
        [
          { value: "prospect", label: "Prospect" },
          { value: "client", label: "Client" },
        ],
        customViews,
      ),
    ).toEqual([
      { value: "leads-chauds", label: "Leads chauds" },
      { value: "leads-froids", label: "Leads froids" },
      { value: "referral", label: "Referral" },
      { value: "prospect", label: "Prospect" },
      { value: "client", label: "Client" },
    ]);
  });
});

describe("formatDealMeetingDate", () => {
  let originalTimezone: string;

  beforeEach(() => {
    originalTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });

  afterEach(async () => {
    await commands.setTimezone(originalTimezone);
  });

  it("shows the local time for a task that carries one", () => {
    // Built in local time and read back in local time, so the assertion holds
    // in any timezone the suite happens to run in.
    const localMeeting = new Date(2026, 7, 25, 11, 0);
    expect(formatDealMeetingDate(localMeeting.toISOString())).toBe(
      "Aug 25, 2026 \u00b7 11:00 AM",
    );
  });

  it("shows no time for a date-only due date, and does not shift the day", async () => {
    // Postponing a task from the list stores a bare YYYY-MM-DD. Rendering
    // "12:00 AM" for it would be a fabricated detail, and parsing it as UTC
    // would move it to the previous day in negative-offset timezones.
    await commands.setTimezone("America/New_York");
    expect(formatDealMeetingDate("2026-08-25")).toBe("Aug 25, 2026");

    await commands.setTimezone("Asia/Tokyo");
    expect(formatDealMeetingDate("2026-08-25")).toBe("Aug 25, 2026");
  });

  it("renders a dash rather than a bogus date when there is nothing to show", () => {
    expect(formatDealMeetingDate(null)).toBe("\u2013");
    expect(formatDealMeetingDate(undefined)).toBe("\u2013");
    expect(formatDealMeetingDate("")).toBe("\u2013");
    expect(formatDealMeetingDate("not-a-date")).toBe("\u2013");
  });
});
