import { describe, expect, it } from "vitest";

import { deciderNom, JAMAIS_VU } from "./dealAutoName";

/**
 * Le scénario que ces tests protègent : `deals.name` est `not null` et son
 * champ n'existe plus à l'écran. Si ce calcul ne se déclenche pas, la création
 * d'opportunité échoue en base.
 */
describe("deciderNom", () => {
  const base = {
    societeId: 42 as unknown,
    nomSociete: "CHU de Nantes",
    nomActuel: "",
    nomTouche: false,
  };

  it("remplit le nom au premier choix de société", () => {
    // Le défaut de la version précédente : `undefined` servait à la fois de
    // « jamais vu » et de « aucune société choisie ». Le premier choix
    // passait donc pour un montage, et le nom restait vide.
    const decision = deciderNom({ ...base, precedent: undefined });
    expect(decision.nom).toBe("CHU de Nantes");
  });

  it("ne renomme pas au montage d'une fiche existante", () => {
    const decision = deciderNom({
      ...base,
      precedent: JAMAIS_VU,
      nomActuel: "Extension 3 sites",
    });
    expect(decision.nom).toBeNull();
  });

  it("suit un changement de société", () => {
    const decision = deciderNom({
      ...base,
      precedent: 7,
      nomActuel: "Clinique du Parc",
    });
    expect(decision.nom).toBe("CHU de Nantes");
  });

  it("ne fait rien si la société n'a pas bougé", () => {
    const decision = deciderNom({ ...base, precedent: 42 });
    expect(decision.nom).toBeNull();
  });

  it("respecte un intitulé écrit à la main", () => {
    const decision = deciderNom({
      ...base,
      precedent: 7,
      nomActuel: "Extension 3 sites",
      nomTouche: true,
    });
    expect(decision.nom).toBeNull();
  });

  it("n'écrase pas un nom par du vide quand la société n'est pas encore chargée", () => {
    const decision = deciderNom({
      ...base,
      precedent: 7,
      nomSociete: undefined,
      nomActuel: "Clinique du Parc",
    });
    expect(decision.nom).toBeNull();
  });

  it("ne réécrit pas une valeur déjà correcte", () => {
    const decision = deciderNom({
      ...base,
      precedent: 7,
      nomActuel: "CHU de Nantes",
    });
    expect(decision.nom).toBeNull();
  });

  it("mémorise toujours la société observée, même sans écriture", () => {
    // Sans cela, un montage suivi d'un changement resterait bloqué sur la
    // sentinelle et n'écrirait jamais.
    expect(deciderNom({ ...base, precedent: JAMAIS_VU }).societeVue).toBe(42);
    expect(deciderNom({ ...base, precedent: 42 }).societeVue).toBe(42);
  });

  it("enchaîne montage puis choix de société", () => {
    let precedent: unknown = JAMAIS_VU;

    const montage = deciderNom({
      ...base,
      societeId: undefined,
      precedent,
      nomSociete: undefined,
    });
    expect(montage.nom).toBeNull();
    precedent = montage.societeVue;

    const choix = deciderNom({ ...base, precedent });
    expect(choix.nom).toBe("CHU de Nantes");
  });
});
