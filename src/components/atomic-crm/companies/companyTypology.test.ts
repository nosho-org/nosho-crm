import { defaultCompanySectors } from "../root/defaultConfiguration";
import { getCompanyTypology } from "./companyTypology";

describe("getCompanyTypology", () => {
  it("has a dedicated pictogram for every configured sector", () => {
    const fallback = getCompanyTypology("definitely-not-a-sector");
    for (const sector of defaultCompanySectors) {
      const typology = getCompanyTypology(sector.value);
      if (sector.value === "autre") continue; // "Autre" legitimately uses the generic building
      expect(
        typology.icon,
        `sector "${sector.value}" falls back to the generic icon`,
      ).not.toBe(fallback.icon);
    }
  });

  it("maps each sector to a distinct pictogram so the list stays scannable", () => {
    const icons = defaultCompanySectors.map(
      (sector) => getCompanyTypology(sector.value).icon,
    );
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("falls back to a generic pictogram for unknown or missing sectors", () => {
    const fallback = getCompanyTypology(undefined);
    expect(fallback.icon).toBeTruthy();
    expect(getCompanyTypology(null).icon).toBe(fallback.icon);
    expect(getCompanyTypology("").icon).toBe(fallback.icon);
    // Sectors are editable in Settings: a custom one must degrade, not crash.
    expect(getCompanyTypology("clinique-veterinaire").icon).toBe(fallback.icon);
  });

  it("always exposes a non-empty label for the accessible name", () => {
    expect(getCompanyTypology("hopital-clinique").label).toBeTruthy();
    expect(getCompanyTypology(undefined).label).toBeTruthy();
  });
});
