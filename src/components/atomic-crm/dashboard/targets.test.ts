import type { Deal, Target } from "../types";
import {
  computeTargetProgress,
  countsTowardTarget,
  dealValue,
  findActiveTarget,
} from "./targets";

const target = (over: Partial<Target> = {}): Target =>
  ({
    id: 1,
    sales_id: null,
    metric: "mrr",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    amount: 25000,
    ...over,
  }) as Target;

const deal = (over: Partial<Deal> = {}): Deal =>
  ({
    id: 1,
    stage: "closed-won",
    won_at: "2026-06-15",
    sales_id: 9,
    amount: 12000,
    mrr: 1000,
    ...over,
  }) as unknown as Deal;

describe("countsTowardTarget", () => {
  it("ne compte que les affaires signées", () => {
    expect(countsTowardTarget(deal({ stage: "negociation" }), target())).toBe(
      false,
    );
    expect(countsTowardTarget(deal(), target())).toBe(true);
  });

  it("ignore une affaire gagnée sans date de signature", () => {
    // La rattacher à `updated_at` ferait basculer d'une période à l'autre des
    // affaires anciennes dès qu'on corrige une faute de frappe dessus.
    expect(countsTowardTarget(deal({ won_at: null }), target())).toBe(false);
  });

  it("compte les bornes de la période comme incluses", () => {
    expect(countsTowardTarget(deal({ won_at: "2026-01-01" }), target())).toBe(
      true,
    );
    expect(countsTowardTarget(deal({ won_at: "2026-12-31" }), target())).toBe(
      true,
    );
    expect(countsTowardTarget(deal({ won_at: "2025-12-31" }), target())).toBe(
      false,
    );
  });

  it("prend tout le monde sur un objectif d'équipe", () => {
    expect(countsTowardTarget(deal({ sales_id: 42 }), target())).toBe(true);
  });

  it("ne prend que ses affaires sur un objectif personnel", () => {
    const mine = target({ sales_id: 9 });
    expect(countsTowardTarget(deal({ sales_id: 9 }), mine)).toBe(true);
    expect(countsTowardTarget(deal({ sales_id: 42 }), mine)).toBe(false);
  });
});

describe("dealValue", () => {
  it("lit le MRR quand il est renseigné", () => {
    expect(dealValue(deal({ mrr: 1500 }), "mrr")).toBe(1500);
  });

  it("dérive le MRR de l'ARR quand il manque", () => {
    // Sans cela un objectif en MRR compterait zéro sur les affaires où seule
    // l'ARR a été saisie — le cas le plus fréquent.
    expect(dealValue(deal({ mrr: null, amount: 12000 }), "mrr")).toBe(1000);
  });

  it("lit l'ARR sans la convertir", () => {
    expect(dealValue(deal({ amount: 12000 }), "arr")).toBe(12000);
  });
});

describe("computeTargetProgress", () => {
  const now = new Date("2026-11-01T10:00:00Z");

  it("additionne les affaires signées de la période", () => {
    const progress = computeTargetProgress(
      target(),
      [deal({ id: 1, mrr: 1000 }), deal({ id: 2, mrr: 1500 })],
      now,
    );
    expect(progress.achieved).toBe(2500);
    expect(progress.remaining).toBe(22500);
    expect(progress.ratio).toBeCloseTo(0.1);
  });

  it("n'affiche jamais un manque négatif sur un objectif dépassé", () => {
    // « il manque -3 000 € » ne veut rien dire.
    const progress = computeTargetProgress(
      target({ amount: 1000 }),
      [deal({ mrr: 4000 })],
      now,
    );
    expect(progress.remaining).toBe(0);
    // Le ratio, lui, dépasse 1 : le dépassement doit se voir.
    expect(progress.ratio).toBe(4);
  });

  it("compte le dernier jour comme un jour où l'on peut encore signer", () => {
    const progress = computeTargetProgress(
      target({ period_end: "2026-11-01" }),
      [],
      now,
    );
    expect(progress.daysLeft).toBe(1);
    expect(progress.isOver).toBe(false);
  });

  it("sait qu'une période est terminée", () => {
    const progress = computeTargetProgress(
      target({ period_end: "2026-10-31" }),
      [],
      now,
    );
    expect(progress.daysLeft).toBe(0);
    expect(progress.isOver).toBe(true);
  });
});

describe("findActiveTarget", () => {
  const now = new Date("2026-08-29T10:00:00Z");

  it("prend l'objectif d'équipe quand on ne demande personne", () => {
    const equipe = target({ id: 1 });
    const perso = target({ id: 2, sales_id: 9 });
    expect(findActiveTarget([equipe, perso], null, now)?.id).toBe(1);
  });

  it("prend l'objectif de la personne demandée", () => {
    const equipe = target({ id: 1 });
    const perso = target({ id: 2, sales_id: 9 });
    expect(findActiveTarget([equipe, perso], 9, now)?.id).toBe(2);
  });

  it("préfère la période la plus courte quand deux se chevauchent", () => {
    // Un objectif trimestriel est plus actionnable que l'annuel qui l'englobe.
    const annuel = target({ id: 1 });
    const trimestre = target({
      id: 2,
      period_start: "2026-07-01",
      period_end: "2026-09-30",
    });
    expect(findActiveTarget([annuel, trimestre], null, now)?.id).toBe(2);
  });

  it("ne rend rien quand aucune période ne couvre aujourd'hui", () => {
    const passe = target({
      period_start: "2025-01-01",
      period_end: "2025-12-31",
    });
    expect(findActiveTarget([passe], null, now)).toBeNull();
  });
});

describe("computeTargetProgress — l'objectif d'équipe sur l'encaisse réelle", () => {
  const now = new Date("2026-08-29T10:00:00Z");
  const actuals = [
    { month: "2026-06-01", amount: 3123.21, transactionCount: 5, bySource: [] },
    { month: "2026-07-01", amount: 3874.31, transactionCount: 9, bySource: [] },
  ];

  it("mesure un objectif d'équipe sur ce qui est arrivé en banque", () => {
    // Le motif du changement : « le montant dans objectif équipe n'est pas le
    // même que dans encaissé ». Deux chiffres présentés comme du MRR, sur un
    // même écran, qui ne concordaient pas.
    const progress = computeTargetProgress(
      target({ amount: 25000 }),
      [deal({ mrr: 9999 })],
      now,
      actuals,
    );
    expect(progress.achieved).toBeCloseTo(6997.52, 2);
  });

  it("laisse un objectif personnel sur les affaires signées du CRM", () => {
    // Un virement bancaire ne porte pas de commercial : il n'y a rien à
    // attribuer.
    const progress = computeTargetProgress(
      target({ sales_id: 9, amount: 12000 }),
      [deal({ sales_id: 9, mrr: 1500 })],
      now,
      actuals,
    );
    expect(progress.achieved).toBe(1500);
  });

  it("ne compte que les mois couverts par la période", () => {
    const progress = computeTargetProgress(
      target({ period_start: "2026-07-01", period_end: "2026-12-31" }),
      [],
      now,
      actuals,
    );
    expect(progress.achieved).toBeCloseTo(3874.31, 2);
  });
});
