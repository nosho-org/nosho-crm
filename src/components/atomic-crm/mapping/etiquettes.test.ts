import { describe, expect, it } from "vitest";

import {
  SEUIL_DEPARTEMENTS,
  SEUIL_OPPORTUNITES,
  SEUIL_VILLES,
  centreDuPlusGrandAnneau,
  couronne,
  placerLesEtiquettes,
  tronquer,
  type EtiquetteCandidate,
} from "./etiquettes";

const candidate = (
  cle: string,
  x: number,
  y: number,
  poids = 0,
  texte = "Ville",
): EtiquetteCandidate<string> => ({ cle, x, y, texte, poids, valeur: cle });

describe("placerLesEtiquettes", () => {
  it("place ce qui ne se touche pas", () => {
    const placees = placerLesEtiquettes(
      [candidate("a", 0, 0), candidate("b", 500, 500)],
      { largeurParCaractere: 5, hauteur: 12 },
    );
    expect(placees.map((e) => e.cle).sort()).toEqual(["a", "b"]);
  });

  /*
   * LA propriété du placement : à superposition, c'est la plus grosse ville
   * qui garde son nom. L'inverse ferait disparaître Marseille au profit d'un
   * village voisin, soit le contraire de ce qu'on vient lire.
   */
  it("donne la place au poids le plus fort", () => {
    const placees = placerLesEtiquettes(
      [
        candidate("village", 0, 0, 1, "Village"),
        candidate("marseille", 2, 0, 25, "Marseille"),
      ],
      { largeurParCaractere: 5, hauteur: 12 },
    );
    expect(placees).toHaveLength(1);
    expect(placees[0].cle).toBe("marseille");
  });

  /*
   * À poids égal, l'ordre doit être le même d'un rendu à l'autre : une
   * étiquette qui clignote au moindre déplacement est pire qu'une absente.
   */
  it("départage deux poids égaux de façon stable", () => {
    const entree = [candidate("b", 0, 0), candidate("a", 2, 0)];
    const premier = placerLesEtiquettes(entree, {
      largeurParCaractere: 5,
      hauteur: 12,
    });
    const second = placerLesEtiquettes([...entree].reverse(), {
      largeurParCaractere: 5,
      hauteur: 12,
    });
    expect(premier.map((e) => e.cle)).toEqual(second.map((e) => e.cle));
    expect(premier[0].cle).toBe("a");
  });

  /** Une couche évite les boîtes de la précédente : les villes sur les départements. */
  it("respecte les boîtes déjà prises", () => {
    const deja = [{ x: -20, y: -5, largeur: 60, hauteur: 20 }];
    const placees = placerLesEtiquettes([candidate("a", 0, 0)], {
      largeurParCaractere: 5,
      hauteur: 12,
      deja,
    });
    expect(placees).toHaveLength(0);
  });

  it("centre la boîte sur le point et la pose dessous", () => {
    const [placee] = placerLesEtiquettes([candidate("a", 100, 50, 0, "Nice")], {
      largeurParCaractere: 5,
      hauteur: 12,
    });
    expect(placee.boite.largeur).toBe(20);
    expect(placee.boite.x).toBe(90);
    expect(placee.boite.y).toBe(50);
  });
});

describe("couronne", () => {
  /*
   * Une seule affaire reste au centre : lui faire faire le tour d'un cercle
   * invisible la déplacerait sans rien apprendre à personne.
   */
  it("laisse une affaire seule au centre", () => {
    expect(couronne(1, 30)).toEqual([{ dx: 0, dy: 0 }]);
    expect(couronne(0, 30)).toEqual([{ dx: 0, dy: 0 }]);
  });

  it("répartit les affaires sur le cercle, en partant du haut", () => {
    const positions = couronne(4, 10);
    expect(positions).toHaveLength(4);
    expect(positions[0].dx).toBeCloseTo(0, 6);
    expect(positions[0].dy).toBeCloseTo(-10, 6);
    // Sens des aiguilles : le suivant part vers la droite.
    expect(positions[1].dx).toBeCloseTo(10, 6);
    for (const { dx, dy } of positions) {
      expect(Math.hypot(dx, dy)).toBeCloseTo(10, 6);
    }
  });
});

describe("centreDuPlusGrandAnneau", () => {
  /*
   * Un département à îles — le Morbihan, la Charente-Maritime — verrait son
   * nom tiré vers la mer si l'on moyennait tous les points. Le plus long
   * anneau est le continent.
   */
  it("ignore les îles et garde le continent", () => {
    const continent = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
    ];
    const ile = [
      [100, 100],
      [101, 100],
      [100, 101],
    ];
    const centre = centreDuPlusGrandAnneau([[continent], [ile]]);
    expect(centre).not.toBeNull();
    expect(centre!.lng).toBeLessThan(20);
    expect(centre!.lat).toBeLessThan(20);
  });

  it("rend null sur un département vide", () => {
    expect(centreDuPlusGrandAnneau([])).toBeNull();
    expect(centreDuPlusGrandAnneau([[[]]])).toBeNull();
  });
});

describe("tronquer", () => {
  it("laisse un nom court intact", () => {
    expect(tronquer("Nice", 10)).toBe("Nice");
  });

  it("coupe un nom trop long et le signale", () => {
    const coupe = tronquer("Centre dentaire de Marseille Nord", 12);
    expect(coupe).toHaveLength(12);
    expect(coupe.endsWith("…")).toBe(true);
  });
});

describe("les seuils", () => {
  /*
   * Ils se succèdent : une ville ne s'écrit pas avant son département, une
   * opportunité pas avant sa ville. Une inversion ferait apparaître les noms
   * d'affaires sur une carte où l'on ne sait pas encore où l'on est.
   */
  it("vont du plus large au plus serré", () => {
    expect(SEUIL_DEPARTEMENTS).toBeLessThan(SEUIL_VILLES);
    expect(SEUIL_VILLES).toBeLessThan(SEUIL_OPPORTUNITES);
  });
});
