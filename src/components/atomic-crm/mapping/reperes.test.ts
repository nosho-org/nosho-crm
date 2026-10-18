import { describe, expect, it } from "vitest";

import { CADRAGE_ENTIER, HAUTEUR, LARGEUR, zoomer } from "./projection";
import { PLAFOND_REPERES, REPERES, reperesVisibles } from "./reperes";

describe("REPERES", () => {
  it("porte les villes de plus de 10 000 habitants", () => {
    expect(REPERES.length).toBeGreaterThan(900);
    for (const repere of REPERES) {
      expect(repere.population).toBeGreaterThanOrEqual(10000);
    }
  });

  /*
   * L'ordre n'est pas cosmétique : `reperesVisibles` s'arrête au plafond, donc
   * un tri cassé retiendrait des villages au lieu des métropoles.
   */
  it("est trié par population décroissante", () => {
    expect(REPERES[0].nom).toBe("Paris");
    for (let i = 1; i < REPERES.length; i++) {
      expect(REPERES[i - 1].population).toBeGreaterThanOrEqual(
        REPERES[i].population,
      );
    }
  });

  /*
   * L'emprise du dessin s'arrête à la métropole. Une ville d'outre-mer s'y
   * projetterait dans un coin de l'Atlantique, à côté d'un trait de côte qui
   * n'est pas le sien.
   */
  it("ne contient aucune ville hors de l'emprise", () => {
    for (const repere of REPERES) {
      expect(repere.x).toBeGreaterThanOrEqual(0);
      expect(repere.x).toBeLessThanOrEqual(LARGEUR);
      expect(repere.y).toBeGreaterThanOrEqual(0);
      expect(repere.y).toBeLessThanOrEqual(HAUTEUR);
    }
    const noms = new Set(REPERES.map((r) => r.nom));
    expect(noms.has("Fort-de-France")).toBe(false);
    expect(noms.has("Cayenne")).toBe(false);
    // La Corse, elle, est dans l'emprise.
    expect(noms.has("Ajaccio")).toBe(true);
  });

  it("range les villes comme la géographie", () => {
    const trouver = (nom: string) => REPERES.find((r) => r.nom === nom)!;
    expect(trouver("Lille").y).toBeLessThan(trouver("Marseille").y);
    expect(trouver("Brest").x).toBeLessThan(trouver("Strasbourg").x);
  });
});

describe("reperesVisibles", () => {
  it("rend les plus grandes villes sur la France entière", () => {
    const vus = reperesVisibles(CADRAGE_ENTIER, new Set());
    expect(vus.length).toBe(PLAFOND_REPERES);
    expect(vus[0].nom).toBe("Paris");
  });

  /*
   * Une ville où l'on a une opportunité est déjà dessinée, en couleur. La
   * redessiner en gris à côté d'elle-même ferait croire à deux lieux.
   */
  it("efface une ville déjà dessinée en pastille", () => {
    const marseille = REPERES.find((r) => r.nom === "Marseille")!;
    const vus = reperesVisibles(CADRAGE_ENTIER, new Set([marseille.cle]));
    expect(vus.some((r) => r.cle === marseille.cle)).toBe(false);
  });

  /*
   * Zoomé sur Marseille, on ne doit pas payer le placement de Lille. C'est ce
   * filtre qui laisse apparaître les petites villes : la place se libère.
   */
  it("ne retient que ce qui tombe dans le cadrage", () => {
    const marseille = REPERES.find((r) => r.nom === "Marseille")!;
    const cadrage = zoomer(CADRAGE_ENTIER, 12, marseille.x, marseille.y);
    const vus = reperesVisibles(cadrage, new Set());
    expect(vus.some((r) => r.nom === "Marseille")).toBe(true);
    expect(vus.some((r) => r.nom === "Lille")).toBe(false);
    // La place libérée profite à des villes qui ne tiendraient jamais à
    // l'échelle du pays.
    expect(vus.some((r) => r.population < 50000)).toBe(true);
  });

  it("respecte le plafond en gardant les plus peuplées", () => {
    const vus = reperesVisibles(CADRAGE_ENTIER, new Set(), 5);
    expect(vus.map((r) => r.nom)).toEqual([
      "Paris",
      "Marseille",
      "Lyon",
      "Toulouse",
      "Nice",
    ]);
  });
});
