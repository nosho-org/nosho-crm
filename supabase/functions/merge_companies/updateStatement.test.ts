import { describe, expect, it } from "vitest";

import {
  construireMiseAJour,
  normaliserLiens,
} from "./updateStatement.ts";

/**
 * Ces tests visent deux pannes réelles de la fusion de sociétés, l'une et
 * l'autre invisibles jusqu'au déploiement. Voir l'en-tête de
 * `updateStatement.ts`.
 */
describe("construireMiseAJour", () => {
  it("numérote les paramètres avec un dollar", () => {
    // La panne du 31/08 : `logo = 9::jsonb` castait l'entier 9, pas le
    // neuvième paramètre. Postgres répondait « cannot cast type integer to
    // jsonb » et annulait toute la transaction.
    const { sql } = construireMiseAJour({ name: "A", logo: null }, 42);
    expect(sql).toBe(
      "update public.companies set name = $1, logo = $2::jsonb where id = $3",
    );
  });

  it("caste les colonnes JSON et sérialise leur valeur", () => {
    const { sql, valeurs } = construireMiseAJour(
      {
        name: "CHU",
        logo: { src: "https://exemple.fr/l.png" },
        context_links: ["https://exemple.fr"],
      },
      7,
    );
    expect(sql).toContain("logo = $2::jsonb");
    expect(sql).toContain("context_links = $3::json");
    expect(valeurs).toEqual([
      "CHU",
      '{"src":"https://exemple.fr/l.png"}',
      '["https://exemple.fr"]',
      7,
    ]);
  });

  it("laisse les colonnes ordinaires sans cast ni sérialisation", () => {
    const { sql, valeurs } = construireMiseAJour({ size: 120 }, 3);
    expect(sql).toBe("update public.companies set size = $1 where id = $2");
    expect(valeurs).toEqual([120, 3]);
  });

  it("distingue une colonne JSON vide d'un JSON null", () => {
    // "null" est du JSON valide : l'écrire viderait la colonne d'une façon
    // que Postgres ne considère pas comme NULL.
    const { valeurs } = construireMiseAJour({ logo: null }, 1);
    expect(valeurs[0]).toBeNull();
  });

  it("place l'identifiant après toutes les colonnes", () => {
    const { sql, valeurs } = construireMiseAJour(
      { a: 1, b: 2, c: 3 },
      99,
    );
    expect(sql).toContain("where id = $4");
    expect(valeurs.at(-1)).toBe(99);
  });
});

describe("normaliserLiens", () => {
  it("laisse un tableau de chaînes intact", () => {
    expect(normaliserLiens(["https://a.fr", "https://b.fr"])).toEqual([
      "https://a.fr",
      "https://b.fr",
    ]);
  });

  it("rend un tableau vide sur null", () => {
    expect(normaliserLiens(null)).toEqual([]);
    expect(normaliserLiens(undefined)).toEqual([]);
  });

  it("accepte un objet là où un tableau était attendu", () => {
    // CHU Martinique #388 portait `{}`. La fusion levait « is not iterable ».
    expect(normaliserLiens({})).toEqual([]);
  });

  it("garde les valeurs d'un objet plutôt que de les perdre", () => {
    expect(normaliserLiens({ site: "https://chu.fr", n: 4 })).toEqual([
      "https://chu.fr",
    ]);
  });

  it("écarte ce qui n'est pas une chaîne dans un tableau", () => {
    expect(normaliserLiens(["https://a.fr", null, 12])).toEqual([
      "https://a.fr",
    ]);
  });
});
