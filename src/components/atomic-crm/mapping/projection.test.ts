import { describe, expect, it } from "vitest";

import {
  CADRAGE_ENTIER,
  EMPRISE,
  HAUTEUR,
  LARGEUR,
  ZOOM_MAX,
  borner,
  deprojeter,
  glisser,
  projeter,
  zoomer,
} from "./projection";

describe("projeter", () => {
  it("place le coin nord-ouest en haut à gauche", () => {
    const coin = projeter({ lat: EMPRISE.latMax, lng: EMPRISE.lngMin });
    expect(coin.x).toBeCloseTo(0, 5);
    expect(coin.y).toBeCloseTo(0, 5);
  });

  it("place le coin sud-est en bas à droite", () => {
    const coin = projeter({ lat: EMPRISE.latMin, lng: EMPRISE.lngMax });
    expect(coin.x).toBeCloseTo(LARGEUR, 5);
    expect(coin.y).toBeCloseTo(HAUTEUR, 5);
  });

  /*
   * Les trois villes doivent tomber dans l'ordre attendu — c'est ce qui
   * distingue une projection d'une formule qui compile.
   */
  it("range les villes comme la géographie", () => {
    const lille = projeter({ lat: 50.63, lng: 3.06 });
    const marseille = projeter({ lat: 43.3, lng: 5.38 });
    const brest = projeter({ lat: 48.39, lng: -4.49 });
    expect(lille.y).toBeLessThan(marseille.y);
    expect(brest.x).toBeLessThan(lille.x);
    expect(lille.x).toBeLessThan(marseille.x);
  });

  /** L'inverse est ce dont le zoom à la molette a besoin. */
  it("se déprojette sur lui-même", () => {
    const nice = { lat: 43.7, lng: 7.27 };
    const { x, y } = projeter(nice);
    const retour = deprojeter(x, y);
    expect(retour.lat).toBeCloseTo(nice.lat, 6);
    expect(retour.lng).toBeCloseTo(nice.lng, 6);
  });
});

describe("zoomer", () => {
  /*
   * LA propriété du zoom à la molette : le point sous le curseur n'a pas
   * bougé. Sans elle, chercher une ville demande de rattraper le cadrage
   * après chaque cran.
   */
  it("garde l'ancre à la même place à l'écran", () => {
    const ancre = projeter({ lat: 43.7, lng: 7.27 });
    const apres = zoomer(CADRAGE_ENTIER, 4, ancre.x, ancre.y);
    const partAvant = {
      x: (ancre.x - CADRAGE_ENTIER.x) / CADRAGE_ENTIER.largeur,
      y: (ancre.y - CADRAGE_ENTIER.y) / CADRAGE_ENTIER.hauteur,
    };
    const partApres = {
      x: (ancre.x - apres.x) / apres.largeur,
      y: (ancre.y - apres.y) / apres.hauteur,
    };
    expect(partApres.x).toBeCloseTo(partAvant.x, 6);
    expect(partApres.y).toBeCloseTo(partAvant.y, 6);
  });

  it("ne dézoome jamais au-delà de la France entière", () => {
    const apres = zoomer(CADRAGE_ENTIER, 0.1, LARGEUR / 2, HAUTEUR / 2);
    expect(apres).toEqual(CADRAGE_ENTIER);
  });

  it("borne le grossissement", () => {
    let cadrage = CADRAGE_ENTIER;
    for (let i = 0; i < 40; i++) {
      cadrage = zoomer(cadrage, 2, LARGEUR / 2, HAUTEUR / 2);
    }
    expect(LARGEUR / cadrage.largeur).toBeLessThanOrEqual(ZOOM_MAX + 1e-9);
  });
});

describe("borner", () => {
  /*
   * Sans cette borne, un glissement un peu vif sort de la carte et laisse un
   * écran blanc dont on ne sait pas revenir autrement qu'en rechargeant.
   */
  it("ramène un cadrage sorti du dessin", () => {
    const perdu = borner({ x: -500, y: -500, largeur: 100, hauteur: 80 });
    expect(perdu.x).toBe(0);
    expect(perdu.y).toBe(0);

    const trop = borner({ x: 99999, y: 99999, largeur: 100, hauteur: 80 });
    expect(trop.x).toBe(LARGEUR - 100);
    expect(trop.y).toBe(HAUTEUR - 80);
  });

  it("ne laisse pas une fenêtre plus grande que le dessin", () => {
    const immense = borner({ x: 0, y: 0, largeur: 99999, hauteur: 99999 });
    expect(immense.largeur).toBe(LARGEUR);
    expect(immense.hauteur).toBe(HAUTEUR);
  });
});

describe("glisser", () => {
  it("déplace la fenêtre et reste dans le dessin", () => {
    const zoome = zoomer(CADRAGE_ENTIER, 4, LARGEUR / 2, HAUTEUR / 2);
    const apres = glisser(zoome, 50, -20);
    expect(apres.x).toBeCloseTo(zoome.x + 50, 6);
    expect(apres.y).toBeCloseTo(zoome.y - 20, 6);
    expect(glisser(zoome, -99999, -99999).x).toBe(0);
  });
});
