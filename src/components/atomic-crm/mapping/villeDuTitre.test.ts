import { describe, expect, it } from "vitest";

import { EXPRESSIONS_TROMPEUSES, villeDuTitre } from "./villeDuTitre";

describe("villeDuTitre", () => {
  /*
   * Les intitulés ci-dessous sont des VRAIS, relevés sur la production le
   * 18/10/2026 parmi les 145 opportunités sans adresse. Les inventer aurait
   * testé ma façon d'écrire un nom d'hôpital, pas celle de Simon.
   */
  it("lit la ville dans les intitulés de la production", () => {
    const cas: [string, string][] = [
      ["CHU de bordeaux", "Bordeaux"],
      ["IMRO IMAGERIE Limoges", "Limoges"],
      ["STRASBOURG ONCOLOGIE LIBERALE", "Strasbourg"],
      ["CENTRE DENTAIRE GRANVELLE (Besançon)", "Besançon"],
      ["Hospice civile de Lyon (HCL)", "Lyon"],
      ["CH BASTIA", "Bastia"],
      ["Mutuelle des Cheminots Région Nantes", "Nantes"],
      ["CPTS du Pays d'Apt", "Apt"],
    ];
    for (const [titre, attendu] of cas) {
      expect(villeDuTitre(titre)?.nom, titre).toBe(attendu);
    }
  });

  /*
   * « Aix-les-Bains » contient « Aix ». Sans préférence pour la plus longue
   * correspondance, ce cabinet atterrirait à Aix-en-Provence, à 300 km.
   */
  it("préfère la correspondance la plus longue", () => {
    const trouvee = villeDuTitre("CABINET DENTAIRE DU PARC - Aix-les-Bains");
    expect(trouvee?.nom).toBe("Aix-les-Bains");
  });

  /*
   * Les deux seules erreurs qu'ait produites la recherche sur les 145
   * intitulés de la production. La Croix-Rouge est une organisation ; l'hôpital
   * Édouard Toulouse est à Marseille et porte le nom d'un psychiatre.
   */
  it("ne prend pas un éponyme pour un lieu", () => {
    expect(villeDuTitre("CROIX ROUGE FRANCAISE")).toBeNull();
    expect(
      villeDuTitre("Clinique Edouard Toulouse (psychiatrique)"),
    ).toBeNull();
    expect(EXPRESSIONS_TROMPEUSES.length).toBeGreaterThan(0);
  });

  /* Le piège ne doit pas effacer une ville citée ailleurs dans le même titre. */
  it("garde une autre ville du même intitulé", () => {
    expect(villeDuTitre("Croix Rouge française - antenne de Rennes")?.nom).toBe(
      "Rennes",
    );
  });

  it("rend null quand rien ne ressemble à une ville", () => {
    expect(villeDuTitre("Groupement hospitalier privé")).toBeNull();
    expect(villeDuTitre("")).toBeNull();
    expect(villeDuTitre(null)).toBeNull();
    expect(villeDuTitre(undefined)).toBeNull();
  });

  /*
   * Le repli est le même que celui du géocodeur : la saisie humaine n'est
   * jamais au caractère près, et les trois formes existent en production.
   */
  it("ignore la casse, les accents et la ponctuation", () => {
    expect(villeDuTitre("CHU DE BESANCON")?.nom).toBe("Besançon");
    expect(villeDuTitre("clinique d'aix-en-provence")?.nom).toBe(
      "Aix-en-Provence",
    );
  });

  /*
   * La recherche ne porte QUE sur les villes de plus de 10 000 habitants : un
   * index de 35 000 communes contient des centaines de mots courants, et
   * chaque intitulé y trouverait un lieu.
   */
  it("ne cherche pas dans les petites communes", () => {
    // Bourg (Gironde), 2 200 habitants : absente des repères, donc ignorée.
    expect(villeDuTitre("Maison de santé du Bourg")).toBeNull();
  });
});
