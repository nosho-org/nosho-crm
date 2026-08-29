import { weeksBetween } from "./contractOffers";

/**
 * La durée n'est plus saisie : le menu déroulant « une semaine / deux semaines
 * / personnalisée » doublait les deux dates, qui la disent déjà. Elle se déduit
 * donc, et sert au seul endroit où elle a un rôle — la formulation de
 * l'article 2, « pour une durée de deux (2) semaines ».
 */
describe("weeksBetween", () => {
  it("compte les bornes incluses, comme le contrat les écrit", () => {
    // « prend effet le lundi 31 août 2026 […] jusqu'au dimanche 13 septembre
    // 2026 inclus » : 13 jours d'écart, 14 jours comptés, deux semaines.
    expect(weeksBetween("2026-08-31", "2026-09-13")).toBe(2);
    expect(weeksBetween("2026-08-31", "2026-09-06")).toBe(1);
  });

  it("ne rend rien quand la durée n'est pas un nombre entier de semaines", () => {
    // Dix jours ne font pas une semaine et demie. Arrondir écrirait « pour une
    // durée de N semaines » suivi d'une date en désaccord avec la phrase.
    expect(weeksBetween("2026-08-31", "2026-09-09")).toBeNull();
  });

  it("ne rend rien sur une borne manquante, vide ou invalide", () => {
    expect(weeksBetween("2026-08-31", null)).toBeNull();
    expect(weeksBetween("", "2026-09-13")).toBeNull();
    expect(weeksBetween("pas une date", "2026-09-13")).toBeNull();
  });

  it("ne rend rien quand la fin précède le début", () => {
    // Une saisie à l'envers ne doit pas produire une durée négative écrite au
    // contrat, ni un zéro qui passerait pour « pas de durée ».
    expect(weeksBetween("2026-09-13", "2026-08-31")).toBeNull();
    expect(weeksBetween("2026-08-31", "2026-08-31")).toBeNull();
  });
});
