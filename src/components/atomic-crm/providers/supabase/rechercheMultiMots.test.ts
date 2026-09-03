import { describe, expect, it } from "vitest";

import {
  construireClause,
  decouperEnMots,
  echapper,
} from "./rechercheMultiMots";

describe("decouperEnMots", () => {
  it("découpe sur la ponctuation autant que sur les espaces", () => {
    // Le cœur du cas Simon : la société s'appelle « BAR-LE-DUC », il tape
    // « bar le duc ». Les deux doivent tomber sur les mêmes mots.
    expect(decouperEnMots("bar le duc")).toEqual(["bar", "le", "duc"]);
    expect(decouperEnMots("BAR-LE-DUC")).toEqual(["BAR", "LE", "DUC"]);
  });

  it("retire les accents", () => {
    expect(decouperEnMots("Ardèche Méridionale")).toEqual([
      "Ardeche",
      "Meridionale",
    ]);
  });

  it("ignore les séparateurs multiples et les bords", () => {
    expect(decouperEnMots("  C.M.C.O.  ")).toEqual(["C", "M", "C", "O"]);
  });

  it("rend une liste vide sur une saisie sans lettre ni chiffre", () => {
    expect(decouperEnMots("   ")).toEqual([]);
    expect(decouperEnMots("---")).toEqual([]);
  });

  it("s'arrête à six mots", () => {
    // Chaque mot ajoute une clause : on ne construit pas une requête à partir
    // d'une phrase collée par erreur.
    expect(decouperEnMots("un deux trois quatre cinq six sept huit")).toHaveLength(6);
  });
});

describe("echapper", () => {
  it("laisse un mot simple tel quel", () => {
    expect(echapper("*duc*")).toBe("*duc*");
  });

  it("entoure ce qui contient une virgule", () => {
    // La virgule sépare les alternatives PostgREST : non échappée, elle
    // couperait la clause en deux et le serveur répondrait par une erreur,
    // donc par une liste vide.
    expect(echapper("*Martin, Dupont*")).toBe('"*Martin, Dupont*"');
  });

  it("entoure ce qui contient une parenthèse", () => {
    expect(echapper("*GHER (Reunion)*")).toBe('"*GHER (Reunion)*"');
  });

  it("double les guillemets internes", () => {
    expect(echapper('*dit "le grand"*')).toBe('"*dit ""le grand""*"');
  });

  it("entoure un terme contenant un point", () => {
    // Le point sépare colonne, opérateur et valeur.
    expect(echapper("*c.m.c.o*")).toBe('"*c.m.c.o*"');
  });
});

describe("construireClause", () => {
  const colonnes = ["name", "company_name"];

  it("exige tous les mots, chacun sur n'importe quelle colonne", () => {
    /*
     * C'est la correction : les mots se combinent en ET, les colonnes en OU.
     * L'ancienne construction mettait tout en OU, si bien que « le » à lui
     * seul ramenait 75 opportunités sur la production.
     */
    expect(construireClause("bar duc", colonnes)).toBe(
      "(or(name.ilike.*bar*,company_name.ilike.*bar*)," +
        "or(name.ilike.*duc*,company_name.ilike.*duc*))",
    );
  });

  it("cherche un mot unique sur toutes les colonnes", () => {
    expect(construireClause("oxance", colonnes)).toBe(
      "(or(name.ilike.*oxance*,company_name.ilike.*oxance*))",
    );
  });

  it("traite la ponctuation en séparateur, pas en contenu", () => {
    /*
     * Ce test affirmait d'abord que « c.m.c.o » produisait des termes
     * échappés. C'était faux : le découpage retire les points AVANT
     * qu'ils atteignent la clause, et les mots qui en sortent n'ont rien
     * à échapper.
     *
     * `echapper` reste néanmoins appliquée — voir son en-tête : la
     * sûreté de la clause ne doit pas dépendre d'une propriété d'un
     * autre module.
     */
    expect(construireClause("c.m.c.o", ["name"])).toBe(
      "(or(name.ilike.*c*),or(name.ilike.*m*)," +
        "or(name.ilike.*c*),or(name.ilike.*o*))",
    );
  });

  it("rend null quand il n'y a rien à chercher", () => {
    // `and()` est un filtre invalide : PostgREST répondrait par une erreur
    // au lieu de la liste entière.
    expect(construireClause("   ", colonnes)).toBeNull();
    expect(construireClause("bar", [])).toBeNull();
  });
});
