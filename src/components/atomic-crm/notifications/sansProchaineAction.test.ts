import { describe, expect, it } from "vitest";

import type { DealRecord } from "../deals/cockpit/dealFields";
import { sansProchaineAction } from "./sansProchaineAction";

const affaire = (
  id: number,
  { stage = "qualified", amount = 10000 } = {},
): DealRecord => ({ id, stage, amount }) as DealRecord;

const ouverte = (deal: DealRecord) => deal.stage !== "lost";

describe("sansProchaineAction", () => {
  it("compte une affaire sans montant", () => {
    // Le défaut d'origine : `rankDealsByFocus` écarte tout montant pondéré nul,
    // et le compte se calculait sur son résultat. Une affaire à 0 € oubliée
    // reste oubliée — c'est même souvent qu'elle n'a jamais été qualifiée.
    const trouvees = sansProchaineAction({
      deals: [affaire(1, { amount: 0 })],
      estOuverte: ouverte,
      aUneProchaineAction: () => false,
    });
    expect(trouvees.map((d) => d.id)).toEqual([1]);
  });

  it("écarte les affaires closes", () => {
    const trouvees = sansProchaineAction({
      deals: [affaire(1, { stage: "lost" }), affaire(2)],
      estOuverte: ouverte,
      aUneProchaineAction: () => false,
    });
    expect(trouvees.map((d) => d.id)).toEqual([2]);
  });

  it("écarte les affaires qui ont déjà une action", () => {
    const trouvees = sansProchaineAction({
      deals: [affaire(1), affaire(2)],
      estOuverte: ouverte,
      aUneProchaineAction: (deal) => deal.id === 1,
    });
    expect(trouvees.map((d) => d.id)).toEqual([2]);
  });

  it("retire l'affaire déjà nommée par la notification de focus", () => {
    const trouvees = sansProchaineAction({
      deals: [affaire(11), affaire(42)],
      estOuverte: ouverte,
      aUneProchaineAction: () => false,
      exclure: 11,
    });
    expect(trouvees.map((d) => d.id)).toEqual([42]);
  });

  it("ne fait pas disparaître le reste en excluant la tête", () => {
    // Le cas Simon : douze affaires sans action, la première étant celle du
    // focus. Retirer celle-ci doit en laisser onze, pas zéro.
    const deals = Array.from({ length: 12 }, (_, i) => affaire(i + 1));
    const trouvees = sansProchaineAction({
      deals,
      estOuverte: ouverte,
      aUneProchaineAction: () => false,
      exclure: 1,
    });
    expect(trouvees).toHaveLength(11);
  });

  it("n'exclut rien sans tête de classement", () => {
    const trouvees = sansProchaineAction({
      deals: [affaire(11)],
      estOuverte: ouverte,
      aUneProchaineAction: () => false,
      exclure: null,
    });
    expect(trouvees.map((d) => d.id)).toEqual([11]);
  });
});
