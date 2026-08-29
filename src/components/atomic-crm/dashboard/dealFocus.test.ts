import type { DealRecord } from "../deals/cockpit/dealFields";
import {
  type FocusOptions,
  explainFocus,
  rankDealsByFocus,
  urgencyMultiplier,
} from "./dealFocus";

const TODAY = new Date("2026-08-29T10:00:00Z");

const options: FocusOptions = {
  stageProbabilities: { qualified: 40, "demo-poc": 60, proposal: 80 },
  pipelineStatuses: ["closed-won", "lost", "churn"],
  dealStages: [
    { value: "lead", label: "Lead" },
    { value: "qualified", label: "Qualifié" },
    { value: "demo-poc", label: "Démo / POC" },
    { value: "proposal", label: "Proposition" },
  ],
  fromStage: "qualified",
  inactivityThresholdDays: 14,
  today: TODAY,
};

const deal = (over: Partial<DealRecord> = {}): DealRecord =>
  ({
    id: 1,
    name: "Un deal",
    stage: "qualified",
    amount: 50000,
    // Touché ce matin : aucune urgence d'ancienneté par défaut.
    last_activity_at: "2026-08-29T08:00:00Z",
    next_action: "Relancer",
    next_action_date: "2026-09-05",
    ...over,
  }) as unknown as DealRecord;

describe("urgencyMultiplier", () => {
  it("vaut 1 sur une affaire fraîche avec une action à venir", () => {
    expect(
      urgencyMultiplier({
        daysSinceActivity: 0,
        daysOverdue: null,
        hasNextAction: true,
      }),
    ).toBe(1);
  });

  it("plafonne l'ancienneté à 60 jours", () => {
    // Au-delà, une affaire n'est pas « deux fois plus morte ».
    const at60 = urgencyMultiplier({
      daysSinceActivity: 60,
      daysOverdue: null,
      hasNextAction: true,
    });
    const at365 = urgencyMultiplier({
      daysSinceActivity: 365,
      daysOverdue: null,
      hasNextAction: true,
    });
    expect(at60).toBe(2);
    expect(at365).toBe(at60);
  });

  it("additionne les causes plutôt que de les multiplier", () => {
    // Une affaire qui cumule tout doit remonter, pas écraser les autres :
    // une file où tout est écrasé par la première ne se lit pas mieux qu'une
    // file non triée.
    expect(
      urgencyMultiplier({
        daysSinceActivity: 60,
        daysOverdue: 30,
        hasNextAction: false,
      }),
    ).toBe(3.5);
  });
});

describe("rankDealsByFocus", () => {
  it("donne 100 à la meilleure affaire et le reste en proportion", () => {
    const ranked = rankDealsByFocus(
      [
        deal({ id: 1, amount: 50000 }),
        deal({ id: 2, amount: 25000 }),
        deal({ id: 3, amount: 5000 }),
      ],
      options,
    );
    expect(ranked.map((c) => c.deal.id)).toEqual([1, 2, 3]);
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(50);
    expect(ranked[2].score).toBe(10);
  });

  it("fait remonter une affaire ancienne devant une plus grosse mais fraîche", () => {
    // C'est tout l'intérêt du classement : « un rappel à 3 k€ et une relance
    // CHU à 50 k€ ont exactement la même apparence » (audit).
    const ranked = rankDealsByFocus(
      [
        deal({
          id: 1,
          amount: 40000,
          last_activity_at: "2026-08-29T08:00:00Z",
        }),
        deal({
          id: 2,
          amount: 30000,
          last_activity_at: "2026-06-01T08:00:00Z",
        }),
      ],
      options,
    );
    // 40 k × 40 % × 1 = 16 000 ; 30 k × 40 % × 2 = 24 000.
    expect(ranked[0].deal.id).toBe(2);
  });

  it("ignore les affaires closes", () => {
    // Une affaire perdue remonterait très haut sur l'ancienneté de son dernier
    // contact — exactement le mauvais conseil.
    const ranked = rankDealsByFocus(
      [
        deal({
          id: 1,
          stage: "lost",
          last_activity_at: "2025-01-01T08:00:00Z",
        }),
        deal({ id: 2 }),
      ],
      options,
    );
    expect(ranked.map((c) => c.deal.id)).toEqual([2]);
  });

  it("écarte une affaire dont la probabilité est inconnue", () => {
    // La pondérer arbitrairement mettrait un chiffre invente en tête d'un
    // écran dont tout l'intérêt est d'être discutable.
    const ranked = rankDealsByFocus([deal({ stage: "inconnue" })], options);
    expect(ranked).toHaveLength(0);
  });

  it("écarte une affaire sans montant", () => {
    expect(rankDealsByFocus([deal({ amount: 0 })], options)).toHaveLength(0);
    expect(
      rankDealsByFocus([deal({ amount: undefined })], options),
    ).toHaveLength(0);
  });

  it("rend une liste vide plutôt que de diviser par zéro", () => {
    expect(rankDealsByFocus([], options)).toEqual([]);
  });

  it("fait remonter une affaire sans prochaine action", () => {
    // Elle n'est pas urgente en soi : elle est invisible, rien ne la fera
    // remonter un autre jour.
    const ranked = rankDealsByFocus(
      [
        deal({ id: 1 }),
        deal({ id: 2, next_action: null, next_action_date: null }),
      ],
      options,
    );
    const sans = ranked.find((c) => c.deal.id === 2);
    expect(sans?.hasNextAction).toBe(false);
    expect(ranked[0].deal.id).toBe(2);
  });
});

describe("explainFocus", () => {
  const euros = (value: number) => `${Math.round(value / 1000)} k€`;

  it("écrit ce qui est en jeu, puis ce qui rend l'affaire urgente", () => {
    const [candidate] = rankDealsByFocus(
      [deal({ amount: 50000, last_activity_at: "2026-08-08T08:00:00Z" })],
      options,
    );
    expect(explainFocus(candidate, euros)).toBe(
      "50 k€ × 40 % · 21 j sans contact",
    );
  });

  it("tait les composantes qui n'ont pas joué", () => {
    // « 0 j sans contact » sur une affaire touchée ce matin ferait douter du
    // reste de la ligne.
    const [candidate] = rankDealsByFocus([deal()], options);
    expect(explainFocus(candidate, euros)).toBe("50 k€ × 40 %");
  });

  it("nomme l'action échue et l'action absente", () => {
    const [overdue] = rankDealsByFocus(
      [deal({ next_action_date: "2026-08-26" })],
      options,
    );
    expect(explainFocus(overdue, euros)).toContain("action échue depuis 3 j");

    const [missing] = rankDealsByFocus(
      [deal({ next_action: null, next_action_date: null })],
      options,
    );
    expect(explainFocus(missing, euros)).toContain("aucune prochaine action");
  });
});
