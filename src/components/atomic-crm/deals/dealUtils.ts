import { format } from "date-fns";

import type { ConfigurationContextValue } from "../root/ConfigurationContext";

export function getDefaultDealStage(
  dealStages: ConfigurationContextValue["dealStages"],
  visibleStages?: string[],
) {
  return (
    visibleStages?.find((stage) =>
      dealStages.some((dealStage) => dealStage.value === stage),
    ) ?? dealStages[0]?.value
  );
}

export function getCompanyTypeChoices(
  companyTypes: ConfigurationContextValue["companyTypes"],
  customViews: ConfigurationContextValue["customViews"],
) {
  const choices = customViews
    .filter((view) => view.companyType)
    .map((view) => ({
      value: view.companyType,
      label: view.label || view.companyType,
    }));
  const seen = new Set(choices.map((type) => type.value));

  companyTypes.forEach((type) => {
    if (seen.has(type.value)) return;

    choices.push(type);
    seen.add(type.value);
  });

  return choices;
}

export function getRelativeTimeString(dateString: string): string {
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  const unitDiff = Math.round(diff / (1000 * 60 * 60 * 24));

  // Check if the date is more than one week old
  if (Math.abs(unitDiff) > 7) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
    }).format(date);
  }

  // Intl.RelativeTimeFormat for dates within the last week
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return ucFirst(rtf.format(unitDiff, "day"));
}

function ucFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const isoDateStringRegex = /^\d{4}-\d{2}-\d{2}$/;

export function formatISODateString(dateString: string | null | undefined) {
  if (!dateString) {
    return "–";
  }
  // Handle both YYYY-MM-DD and full ISO timestamps (e.g. 2025-03-15T00:00:00.000Z)
  const normalizedDate = dateString.split("T")[0];
  if (!isoDateStringRegex.test(normalizedDate)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }
  // Some browsers will consider a date in the format YYYY-MM-DD as UTC, which can cause off-by-one-day issues depending on the user's timezone.
  // To avoid this, we can parse the date components manually and create a date object in the local timezone.
  const [year, month, day] = normalizedDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return format(date, "PP");
}
