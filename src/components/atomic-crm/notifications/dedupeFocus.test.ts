import { describe, expect, it } from "vitest";

import { autresQueLaTete } from "./dedupeFocus";

const candidat = (id: number) => ({ deal: { id } });

describe("autresQueLaTete", () => {
  it("retire l'affaire déjà nommée par la notification de focus", () => {
    // Le cas Oxance : une seule affaire sans prochaine action, et c'est
    // exactement celle que la cloche vient d'annoncer.
    expect(autresQueLaTete([candidat(11)], candidat(11))).toEqual([]);
  });

  it("garde les autres affaires", () => {
    const reste = autresQueLaTete(
      [candidat(11), candidat(42), candidat(7)],
      candidat(11),
    );
    expect(reste.map((c) => c.deal.id)).toEqual([42, 7]);
  });

  it("ne retire rien quand la tête a bien une prochaine action", () => {
    const reste = autresQueLaTete([candidat(42)], candidat(11));
    expect(reste.map((c) => c.deal.id)).toEqual([42]);
  });

  it("laisse la liste intacte sans tête de classement", () => {
    const sansAction = [candidat(42)];
    expect(autresQueLaTete(sansAction, undefined)).toEqual(sansAction);
  });
});
