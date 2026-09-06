import {
  defaultDealPipelineStatuses,
  defaultDealStageProbabilities,
} from "../root/defaultConfiguration";
import { getDealProbability } from "./cockpit/dealWeighting";
import type { DealRecord } from "./cockpit/dealFields";

const config = {
  stageProbabilities: defaultDealStageProbabilities,
  pipelineStatuses: defaultDealPipelineStatuses,
};

const deal = (stage: string, amount = 1000): DealRecord =>
  ({ id: 1, stage, amount }) as DealRecord;

/**
 * NOS-1066. La grille demandée par Simon n'a que cinq lignes configurables ;
 * les quatre autres étapes sont obtenues par construction. Ce test dit
 * lesquelles, pour qu'on ne « corrige » pas plus tard une absence qui est un
 * choix.
 */
describe("pondération par étape", () => {
  it("applies the agreed grid to open stages", () => {
    expect(getDealProbability(deal("lead"), config).value).toBe(0.1);
    expect(getDealProbability(deal("qualified"), config).value).toBe(0.2);
    expect(getDealProbability(deal("demo"), config).value).toBe(0.4);
    // Le POC vaut 55 % depuis le découpage du 06/09/2026 : entre la démo et
    // la proposition. Un POC lancé engage l'établissement — un accès, des
    // utilisateurs, souvent un contrat POC — sans que le prix soit acté.
    expect(getDealProbability(deal("poc"), config).value).toBe(0.55);
    expect(getDealProbability(deal("proposal"), config).value).toBe(0.7);
    expect(getDealProbability(deal("negociation"), config).value).toBe(0.85);
  });

  it("treats a closed outcome as a fact, not an estimate", () => {
    // 100 % et 0 % sans passer par la grille : le résultat est connu.
    expect(getDealProbability(deal("closed-won"), config)).toEqual({
      value: 1,
      source: "won-stage",
    });
    expect(getDealProbability(deal("lost"), config)).toEqual({
      value: 0,
      source: "lost-stage",
    });
    // Churn compte comme perdu : il figure dans `dealPipelineStatuses`.
    expect(getDealProbability(deal("churn"), config)).toEqual({
      value: 0,
      source: "lost-stage",
    });
  });

  it("leaves À reclasser unweighted rather than worth zero", () => {
    // « Exclu du forecast » et « estimé sans valeur » ne sont pas la même
    // chose : `value: null` sort l'opportunité des totaux au lieu de la
    // compter pour rien.
    expect(getDealProbability(deal("a-reclasser"), config)).toEqual({
      value: null,
      source: "none",
    });
  });

  it("lets a per-deal exception win over the grid", () => {
    const exception = { ...deal("qualified"), probability: 90 } as DealRecord;
    expect(getDealProbability(exception, config)).toEqual({
      value: 0.9,
      source: "deal",
    });
  });
});
