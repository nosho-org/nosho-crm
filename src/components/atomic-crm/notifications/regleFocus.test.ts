import { describe, expect, it } from "vitest";

import { focusMeriteNotification } from "./regleFocus";

describe("focusMeriteNotification", () => {
  it("notifie quand aucune action n'est planifiée", () => {
    // Le cas Oxance : trois tâches terminées, plus rien de prévu.
    expect(
      focusMeriteNotification({ hasNextAction: false, daysOverdue: null }),
    ).toBe(true);
  });

  it("notifie quand l'action est échue", () => {
    expect(
      focusMeriteNotification({ hasNextAction: true, daysOverdue: 3 }),
    ).toBe(true);
  });

  it("se tait quand l'action est planifiée pour plus tard", () => {
    // Simon : « uniquement si une action reste à faire ». Une relance prévue
    // la semaine prochaine n'est pas une action qui reste à faire aujourd'hui.
    expect(
      focusMeriteNotification({ hasNextAction: true, daysOverdue: null }),
    ).toBe(false);
  });

  it("se tait sur une action du jour non encore échue", () => {
    expect(focusMeriteNotification({ hasNextAction: true, daysOverdue: 0 })).toBe(
      false,
    );
  });

  it("se tait quand il n'y a aucune affaire", () => {
    expect(focusMeriteNotification(undefined)).toBe(false);
    expect(focusMeriteNotification(null)).toBe(false);
  });
});
