import { describe, expect, it } from "vitest";

import { TAILLE_INDEX, placer, replier } from "./geocoder";

/**
 * Les cas viennent de la PRODUCTION, relevés le 18/10/2026 sur les 150 couples
 * (code postal, ville) que portent les opportunités non archivées.
 */
describe("placer", () => {
  it("place par le code postal", () => {
    const nice = placer({ zipcode: "06000", city: null });
    expect(nice).not.toBeNull();
    // Nice : 43,70 N / 7,27 E. Une tolérance large — on vérifie qu'on est sur
    // la bonne ville, pas que l'IGN a raison.
    expect(nice!.lat).toBeCloseTo(43.7, 1);
    expect(nice!.lng).toBeCloseTo(7.27, 1);
  });

  /*
   * Deux codes postaux de production portent une espace de saisie — « 95220 »
   * et « 77 ». Le premier doit passer ; sans le `trim`, une ville entière
   * disparaît de la carte sans que rien ne le signale.
   */
  it("supporte une espace parasite dans le code postal", () => {
    expect(placer({ zipcode: "95220 ", city: null })).not.toBeNull();
  });

  it("retombe sur le nom quand le code postal manque", () => {
    const paris = placer({ zipcode: null, city: "Paris" });
    expect(paris).not.toBeNull();
    expect(paris!.lat).toBeCloseTo(48.85, 1);
  });

  /*
   * « Aix En Provence », « AIX-EN-PROVENCE » et « Aix-en-Provence » existent
   * toutes les trois en production : c'est la saisie humaine, et elle n'est
   * jamais au caractère près.
   */
  it("ignore la casse, les accents et la ponctuation du nom", () => {
    const formes = ["Aix En Provence", "AIX-EN-PROVENCE", "aix-en-provence"];
    const points = formes.map((ville) =>
      placer({ zipcode: null, city: ville }),
    );
    expect(points.every((p) => p !== null)).toBe(true);
    expect(new Set(points.map((p) => `${p!.lat},${p!.lng}`)).size).toBe(1);
  });

  /*
   * Le code postal prime sur le nom, et l'ordre compte : un nom de ville est
   * saisi à la main, un code postal désigne une commune.
   */
  it("préfère le code postal au nom quand les deux se contredisent", () => {
    const parCp = placer({ zipcode: "13001", city: "Lille" });
    const marseille = placer({ zipcode: "13001", city: null });
    expect(parCp).toEqual(marseille);
  });

  /*
   * Les deux seuls échecs de la production sont des RÉGIONS saisies dans le
   * champ ville. Les refuser est le bon comportement : placer un point au
   * centre de l'Île-de-France dessinerait une précision que la donnée n'a pas.
   */
  it("refuse une région, une adresse vide, un code inconnu", () => {
    expect(placer({ zipcode: null, city: "Île-De-France" })).toBeNull();
    expect(placer({ zipcode: null, city: "Hauts-De-France" })).toBeNull();
    expect(placer({ zipcode: null, city: null })).toBeNull();
    expect(placer({ zipcode: "", city: "" })).toBeNull();
    expect(placer({ zipcode: "99999", city: null })).toBeNull();
  });

  /*
   * Un code postal partagé par plusieurs communes revient à la plus peuplée.
   * C'est un arbitrage, pas une vérité — mais c'est celui qui se trompe le
   * moins souvent, et il doit être stable d'un rendu à l'autre.
   */
  it("rend toujours le même point pour un code postal donné", () => {
    expect(placer({ zipcode: "13001", city: null })).toEqual(
      placer({ zipcode: "13001", city: null }),
    );
  });
});

describe("replier", () => {
  it("réduit à des mots minuscules sans accent", () => {
    expect(replier("Aix-en-Provence")).toBe("aix en provence");
    expect(replier("  SAINT-ÉTIENNE ")).toBe("saint etienne");
    expect(replier(null)).toBe("");
  });
});

describe("l'index embarqué", () => {
  /*
   * Mesuré, pas affirmé. Si quelqu'un régénère l'index avec un autre seuil de
   * population, ce test le dit — et c'est la seule façon de s'apercevoir que
   * le poids du bundle vient de changer.
   */
  it("porte les codes postaux de France et les communes d'au moins mille habitants", () => {
    expect(TAILLE_INDEX.codesPostaux).toBeGreaterThan(6000);
    expect(TAILLE_INDEX.codesPostaux).toBeLessThan(7000);
    expect(TAILLE_INDEX.noms).toBeGreaterThan(9000);
    expect(TAILLE_INDEX.noms).toBeLessThan(11000);
  });
});
