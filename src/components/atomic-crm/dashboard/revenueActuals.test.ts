import type { RevenueActual } from "../types";
import {
  formatMonth,
  groupByMonth,
  lastCompleteMonth,
  monthOverMonth,
} from "./revenueActuals";

const row = (
  month: string,
  source: string,
  amount: number,
  count = 1,
): RevenueActual =>
  ({
    id: `${month}-${source}`,
    month,
    source,
    amount,
    transaction_count: count,
  }) as unknown as RevenueActual;

// Les chiffres réels relevés le 29 août 2026 sur le compte Qonto.
const JUIN = [row("2026-06-01", "mollie", 3123.21, 5)];
const JUILLET = [
  row("2026-07-01", "mollie", 3166.31, 8),
  row("2026-07-01", "virement", 708, 1),
];

describe("groupByMonth", () => {
  it("additionne les deux sources d'un même mois", () => {
    // 3 166,31 de Mollie + 708 d'Hôpital Européen = 3 874,31, le chiffre que
    // Simon annonçait et que le filtre Mollie seul ratait.
    const [juillet] = groupByMonth(JUILLET);
    expect(juillet.amount).toBeCloseTo(3874.31, 2);
    expect(juillet.transactionCount).toBe(9);
    expect(juillet.bySource).toHaveLength(2);
  });

  it("rend les mois dans l'ordre chronologique", () => {
    const months = groupByMonth([...JUILLET, ...JUIN]).map((m) => m.month);
    expect(months).toEqual(["2026-06-01", "2026-07-01"]);
  });
});

describe("lastCompleteMonth", () => {
  it("écarte le mois en cours, même s'il porte déjà un total", () => {
    // La règle demandée : « tant que le mois n'est pas fini, tu conserves le
    // MRR du mois précédent ». Un mois entamé au tiers afficherait un tiers du
    // chiffre, et se lirait comme une chute de 66 %.
    const aout = [row("2026-08-01", "mollie", 2223.46, 4)];
    const result = lastCompleteMonth(
      [...JUIN, ...JUILLET, ...aout],
      new Date("2026-08-29T10:00:00Z"),
    );
    expect(result?.month).toBe("2026-07-01");
    expect(result?.amount).toBeCloseTo(3874.31, 2);
  });

  it("bascule sur le mois suivant une fois celui-ci terminé", () => {
    const aout = [row("2026-08-01", "mollie", 2223.46, 4)];
    const result = lastCompleteMonth(
      [...JUILLET, ...aout],
      new Date("2026-09-01T10:00:00Z"),
    );
    expect(result?.month).toBe("2026-08-01");
  });

  it("ne rend rien quand aucun mois n'est complet", () => {
    const result = lastCompleteMonth(JUILLET, new Date("2026-07-15T10:00:00Z"));
    expect(result).toBeNull();
  });
});

describe("monthOverMonth", () => {
  it("compare les deux derniers mois complets", () => {
    const result = monthOverMonth(
      [...JUIN, ...JUILLET],
      new Date("2026-08-29T10:00:00Z"),
    );
    expect(result?.current.month).toBe("2026-07-01");
    expect(result?.previous?.month).toBe("2026-06-01");
    // (3874,31 − 3123,21) / 3123,21 ≈ +24 %
    expect(result?.deltaPercent).toBe(24);
  });

  it("n'invente pas de pourcentage sans mois précédent", () => {
    const result = monthOverMonth(JUILLET, new Date("2026-08-29T10:00:00Z"));
    expect(result?.previous).toBeNull();
    expect(result?.deltaPercent).toBeNull();
  });
});

describe("formatMonth", () => {
  it("nomme le mois, parce qu'un chiffre sans son mois se lit « maintenant »", () => {
    expect(formatMonth("2026-07-01")).toBe("juillet 2026");
  });
});
