import { commands } from "vitest/browser";

import {
  formatISODateString,
  getCompanyTypeChoices,
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
});
