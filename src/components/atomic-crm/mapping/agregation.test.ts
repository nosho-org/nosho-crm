import { describe, expect, it } from "vitest";

import { agreger, arcs, rayon, type AffaireLocalisable } from "./agregation";

const ETAPES = ["lead", "qualified", "demo", "poc", "proposal"];

const affaire = (
  id: number,
  stage: string,
  lieu: Partial<AffaireLocalisable> = {},
): AffaireLocalisable => ({
  id,
  name: `Affaire ${id}`,
  stage,
  amount: 12000,
  company_name: `Société ${id}`,
  company_city: "Nice",
  company_zipcode: "06000",
  ...lieu,
});

describe("agreger", () => {
  it("réunit une ville en une seule pastille", () => {
    const { pastilles } = agreger(
      [affaire(1, "lead"), affaire(2, "qualified"), affaire(3, "lead")],
      ETAPES,
    );
    expect(pastilles).toHaveLength(1);
    expect(pastilles[0].nombre).toBe(3);
    expect(pastilles[0].ville).toBe("Nice");
    expect(pastilles[0].arr).toBe(36000);
  });

  /*
   * Le tiers du pipeline n'a pas d'adresse (145 opportunités ouvertes sur 446,
   * mesuré le 18/10/2026). Les taire montrerait les deux tiers restants comme
   * si c'était tout — et personne ne s'en apercevrait.
   */
  /*
   * DEUX listes et non une. Écrit d'abord avec une seule, et la démonstration
   * l'a démenti en trente secondes : les sociétés de démo sont américaines —
   * elles ONT une ville et un code postal — et l'écran annonçait « 100 %
   * n'ont ni code postal ni ville ». Un message faux sur la seule chose que
   * cet écran est chargé de dire honnêtement.
   */
  it("sépare ce qui n'a pas d'adresse de ce qu'on ne sait pas placer", () => {
    const { pastilles, sansAdresse, nonPlacees } = agreger(
      [
        affaire(1, "lead"),
        affaire(2, "lead", { company_city: null, company_zipcode: null }),
        affaire(3, "lead", {
          company_city: "Île-De-France",
          company_zipcode: null,
        }),
        affaire(4, "lead", {
          company_city: "Boston",
          company_zipcode: "02108",
        }),
      ],
      ETAPES,
    );
    expect(pastilles[0].nombre).toBe(1);
    expect(sansAdresse.map((a) => a.id)).toEqual([2]);
    expect(nonPlacees.map((a) => a.id)).toEqual([3, 4]);
  });

  /** Une espace seule n'est pas une adresse qu'on aurait mal lue. */
  it("compte une adresse vide comme absente, pas comme illisible", () => {
    const { sansAdresse, nonPlacees } = agreger(
      [affaire(1, "lead", { company_city: "  ", company_zipcode: " " })],
      ETAPES,
    );
    expect(sansAdresse).toHaveLength(1);
    expect(nonPlacees).toHaveLength(0);
  });

  /*
   * Deux saisies de la même commune tombent sur le même point : elles doivent
   * faire UNE pastille, sinon Nice apparaît trois fois au même endroit.
   */
  it("fond les orthographes d'une même ville", () => {
    const { pastilles } = agreger(
      [
        affaire(1, "lead", {
          company_city: "Aix En Provence",
          company_zipcode: null,
        }),
        affaire(2, "lead", {
          company_city: "AIX-EN-PROVENCE",
          company_zipcode: null,
        }),
        affaire(3, "lead", {
          company_city: "Aix-en-Provence",
          company_zipcode: null,
        }),
      ],
      ETAPES,
    );
    expect(pastilles).toHaveLength(1);
    expect(pastilles[0].nombre).toBe(3);
  });

  /*
   * Le libellé affiché est le plus FRÉQUENT et non le premier : le premier
   * dépend de l'ordre de tri, donc du filtre courant, et le nom de la ville
   * changerait sous les yeux de qui filtre.
   */
  it("affiche l'orthographe la plus fréquente", () => {
    const { pastilles } = agreger(
      [
        affaire(1, "lead", {
          company_city: "AIX-EN-PROVENCE",
          company_zipcode: null,
        }),
        affaire(2, "lead", {
          company_city: "Aix-en-Provence",
          company_zipcode: null,
        }),
        affaire(3, "lead", {
          company_city: "Aix-en-Provence",
          company_zipcode: null,
        }),
      ],
      ETAPES,
    );
    expect(pastilles[0].ville).toBe("Aix-en-Provence");
  });

  it("ordonne les parts comme le pipeline, pas comme les données", () => {
    const { pastilles } = agreger(
      [affaire(1, "poc"), affaire(2, "lead"), affaire(3, "qualified")],
      ETAPES,
    );
    expect(pastilles[0].parEtape.map((p) => p.stage)).toEqual([
      "lead",
      "qualified",
      "poc",
    ]);
  });

  /*
   * La production porte dix opportunités à des étapes qui n'existent plus dans
   * la configuration. Les jeter ferait un compte de ville plus petit que la
   * réalité, en silence.
   */
  it("garde une étape absente du référentiel, en fin d'anneau", () => {
    const { pastilles } = agreger(
      [affaire(1, "ressources"), affaire(2, "lead")],
      ETAPES,
    );
    expect(pastilles[0].nombre).toBe(2);
    expect(pastilles[0].parEtape.at(-1)!.stage).toBe("ressources");
  });

  /*
   * Les grosses pastilles d'abord dans le tableau, donc dessinées SOUS les
   * petites : une ville à une affaire posée sur une ville à vingt reste
   * cliquable. L'ordre du document EST l'ordre de rendu en SVG.
   */
  it("range les grosses pastilles en premier", () => {
    const { pastilles } = agreger(
      [
        affaire(1, "lead", { company_zipcode: "75001", company_city: "Paris" }),
        affaire(2, "lead"),
        affaire(3, "lead"),
      ],
      ETAPES,
    );
    expect(pastilles[0].nombre).toBe(2);
    expect(pastilles[1].nombre).toBe(1);
  });

  it("compte une affaire sans montant pour zéro", () => {
    const { pastilles } = agreger(
      [affaire(1, "lead", { amount: null }), affaire(2, "lead")],
      ETAPES,
    );
    expect(pastilles[0].arr).toBe(12000);
  });
});

describe("rayon", () => {
  /*
   * C'est la SURFACE qu'on lit sur un disque. Proportionner le rayon au compte
   * ferait d'une ville à neuf affaires une tache neuf fois trop grosse.
   */
  it("suit la racine du compte, pas le compte", () => {
    const max = 16;
    const MINIMUM = 4;
    /*
     * La part VARIABLE du rayon — au-dessus du minimum lisible — suit la
     * racine. Doubler la racine double donc cette part : de 1 à 4, puis de 4
     * à 16. C'est ce qui fait qu'on lit une SURFACE proportionnelle au compte.
     *
     * Le minimum, lui, est un plancher d'affichage et ne se met pas à
     * l'échelle : une ville à une affaire doit rester visible. Comparer les
     * rayons BRUTS ferait croire à un défaut — c'est l'erreur que ce test a
     * d'abord commise.
     */
    const part = (n: number) => rayon(n, max) - MINIMUM;
    expect(part(4) / part(1)).toBeCloseTo(2, 6);
    expect(part(16) / part(4)).toBeCloseTo(2, 6);
  });

  it("garde un minimum visible et un maximum borné", () => {
    expect(rayon(1, 100)).toBeGreaterThanOrEqual(4);
    expect(rayon(100, 100)).toBeLessThanOrEqual(22);
    expect(rayon(1, 1)).toBe(4);
  });
});

describe("arcs", () => {
  it("découpe l'anneau en parts cumulées", () => {
    const segments = arcs(
      [
        { stage: "lead", nombre: 1 },
        { stage: "qualified", nombre: 3 },
      ],
      4,
    );
    expect(segments[0]).toEqual({ stage: "lead", part: 0.25, depart: 0 });
    expect(segments[1]).toEqual({
      stage: "qualified",
      part: 0.75,
      depart: 0.25,
    });
  });

  it("rend un tour complet sur une seule étape", () => {
    const [seul] = arcs([{ stage: "lead", nombre: 5 }], 5);
    expect(seul.part).toBe(1);
    expect(seul.depart).toBe(0);
  });

  /** Un total nul ne doit pas produire de `NaN` dans un attribut SVG. */
  it("ne divise pas par zéro", () => {
    expect(arcs([{ stage: "lead", nombre: 0 }], 0)[0].part).toBe(0);
  });
});
