import type { Deal } from "../types";
import { computeNewLeadsTrend, describeLeadsTrend } from "./newLeads";

const deal = (entered: string | null, created?: string): Deal =>
  ({ id: Math.random(), entered_at: entered, created_at: created }) as Deal;

// 15 août 2026 : le mois est à moitié écoulé.
const MID_AUGUST = new Date("2026-08-15T10:00:00Z");

describe("computeNewLeadsTrend", () => {
  it("compte le mois en cours et le mois précédent", () => {
    const trend = computeNewLeadsTrend(
      [
        deal("2026-08-02"),
        deal("2026-08-14"),
        deal("2026-07-03"),
        deal("2026-07-20"),
        deal("2026-07-28"),
        deal("2026-06-15"),
      ],
      MID_AUGUST,
    );
    expect(trend.current).toBe(2);
    expect(trend.previous).toBe(3);
    expect(trend.deltaPercent).toBe(-33);
  });

  it("retombe sur la date de création quand l'entrée manque", () => {
    // Elles diffèrent à chaque reprise d'historique, et une opportunité sans
    // date d'entrée est bien entrée quelque part.
    const trend = computeNewLeadsTrend(
      [deal(null, "2026-08-05T09:00:00Z")],
      MID_AUGUST,
    );
    expect(trend.current).toBe(1);
  });

  it("ne rend aucun pourcentage quand le mois précédent est vide", () => {
    // Passer de 0 à 5 n'est pas « +500 % », c'est un départ.
    const trend = computeNewLeadsTrend([deal("2026-08-02")], MID_AUGUST);
    expect(trend.previous).toBe(0);
    expect(trend.deltaPercent).toBeNull();
  });

  it("passe correctement de janvier à décembre", () => {
    // Décrémenter le mois à la main donnerait le mois −1.
    const trend = computeNewLeadsTrend(
      [deal("2027-01-05"), deal("2026-12-20"), deal("2026-12-28")],
      new Date("2027-01-15T10:00:00Z"),
    );
    expect(trend.current).toBe(1);
    expect(trend.previous).toBe(2);
  });

  it("sait que le mois en cours est incomplet", () => {
    expect(computeNewLeadsTrend([], MID_AUGUST).isPartialMonth).toBe(true);
    expect(computeNewLeadsTrend([], MID_AUGUST).monthProgress).toBeCloseTo(
      15 / 31,
    );
    // Le 31 août, le mois est complet.
    expect(
      computeNewLeadsTrend([], new Date("2026-08-31T10:00:00Z")).isPartialMonth,
    ).toBe(false);
  });

  it("ignore une date illisible plutôt que de la compter", () => {
    const trend = computeNewLeadsTrend([deal("pas une date")], MID_AUGUST);
    expect(trend.current).toBe(0);
  });
});

describe("describeLeadsTrend", () => {
  it("qualifie la comparaison tant que le mois est peu entamé", () => {
    // Comparer un mois entamé au tiers à un mois complet donne mécaniquement
    // une baisse : sans le dire, on conclurait à un effondrement tous les 2 du
    // mois.
    const trend = computeNewLeadsTrend(
      [deal("2026-08-01"), deal("2026-07-01"), deal("2026-07-15")],
      new Date("2026-08-03T10:00:00Z"),
    );
    expect(describeLeadsTrend(trend)).toContain("mois en cours");
  });

  it("écrit la variation seule une fois le mois bien avancé", () => {
    const trend = computeNewLeadsTrend(
      [deal("2026-08-01"), deal("2026-08-02"), deal("2026-07-01")],
      new Date("2026-08-25T10:00:00Z"),
    );
    expect(describeLeadsTrend(trend)).toBe("+100 % vs mois dernier (1)");
  });

  it("dit qu'il n'y avait rien plutôt que d'inventer un pourcentage", () => {
    const trend = computeNewLeadsTrend([deal("2026-08-01")], MID_AUGUST);
    expect(describeLeadsTrend(trend)).toBe("aucun le mois dernier");
  });
});
