import type { Company } from "../types";
import {
  completenessScore,
  countRedundant,
  findDuplicateGroups,
  normalizeCompanyName,
  normalizeSiret,
} from "./companyDuplicates";

const company = (over: Partial<Company> = {}): Company =>
  ({
    id: 1,
    name: "Biotech Dental",
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as unknown as Company;

describe("normalizeCompanyName", () => {
  it("ignore accents, casse et ponctuation", () => {
    expect(normalizeCompanyName("C.M.C.O. Centre Méditerranéen")).toBe(
      "c m c o centre mediterraneen",
    );
    expect(normalizeCompanyName("AGENCE COMETHIC")).toBe(
      normalizeCompanyName("Agence ComEthic"),
    );
  });

  it("ne retire PAS les formes juridiques", () => {
    // Chaque astuce de ce genre rapproche de vrais doublons et en fabrique de
    // faux. Sur des données de santé, confondre deux établissements coûte plus
    // cher qu'un doublon laissé en place.
    expect(normalizeCompanyName("Nosho SAS")).not.toBe(
      normalizeCompanyName("Nosho SARL"),
    );
  });
});

describe("normalizeSiret", () => {
  it("ne garde que les chiffres", () => {
    expect(normalizeSiret("123 456 789 00011")).toBe("12345678900011");
  });
});

describe("findDuplicateGroups", () => {
  it("regroupe sur le SIRET, quels que soient les noms", () => {
    // Un SIRET est un identifiant légal, pas une ressemblance : deux fiches
    // qui le partagent sont le même établissement.
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Clinique X", tax_identifier: "12345678900011" }),
      company({
        id: 2,
        name: "CLINIQUE X SAS",
        tax_identifier: "123 456 789 00011",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("siret");
    expect(groups[0].companies).toHaveLength(2);
  });

  it("ignore un SIRET tronqué, qui n'identifie rien", () => {
    const groups = findDuplicateGroups([
      company({ id: 1, name: "A", tax_identifier: "123" }),
      company({ id: 2, name: "B", tax_identifier: "123" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("regroupe sur le nom quand il n'y a pas de SIRET", () => {
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Biotech Dental" }),
      company({ id: 2, name: "BIOTECH DENTAL" }),
      company({ id: 3, name: "Biotech-Dental" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].kind).toBe("name");
    expect(groups[0].companies).toHaveLength(3);
  });

  it("ne propose pas deux fois le même trio", () => {
    // Sans exclusion, un groupe deja forme par SIRET reapparaitrait par le
    // nom, et l'ecran donnerait deux chiffres pour le meme probleme.
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Clikodoc", tax_identifier: "12345678900011" }),
      company({ id: 2, name: "Clikodoc", tax_identifier: "12345678900011" }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("ne groupe pas une fiche seule", () => {
    expect(findDuplicateGroups([company()])).toHaveLength(0);
  });

  it("met la fiche la mieux renseignée en tête", () => {
    // C'est elle qui doit gagner la fusion : une fiche créée par erreur puis
    // enrichie vaut mieux qu'une fiche d'origine restée vide.
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Kersanté", created_at: "2025-01-01T00:00:00Z" }),
      company({
        id: 2,
        name: "Kersante",
        created_at: "2026-06-01T00:00:00Z",
        tax_identifier: "12345678900011",
        city: "Marseille",
        website: "https://kersante.fr",
        nb_deals: 3,
      }),
    ]);
    expect(groups[0].companies[0].id).toBe(2);
  });

  it("départage à complétude égale par l'ancienneté", () => {
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Biton", created_at: "2026-06-01T00:00:00Z" }),
      company({ id: 2, name: "Biton", created_at: "2025-01-01T00:00:00Z" }),
    ]);
    expect(groups[0].companies[0].id).toBe(2);
  });

  it("présente les certitudes avant les hypothèses", () => {
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Alpha" }),
      company({ id: 2, name: "ALPHA" }),
      company({ id: 3, name: "Beta", tax_identifier: "99999999900011" }),
      company({ id: 4, name: "Gamma", tax_identifier: "99999999900011" }),
    ]);
    expect(groups[0].kind).toBe("siret");
    expect(groups[1].kind).toBe("name");
  });
});

describe("completenessScore", () => {
  it("fait peser les rattachements plus lourd que les champs", () => {
    // Une fiche qui porte des opportunités est celle que l'équipe utilise.
    const vide = company({ nb_deals: 3 });
    const remplie = company({ city: "Marseille", website: "x" });
    expect(completenessScore(vide)).toBeGreaterThan(completenessScore(remplie));
  });
});

describe("countRedundant", () => {
  it("compte les fiches qui disparaîtraient, pas les groupes", () => {
    const groups = findDuplicateGroups([
      company({ id: 1, name: "Alpha" }),
      company({ id: 2, name: "Alpha" }),
      company({ id: 3, name: "Alpha" }),
      company({ id: 4, name: "Beta" }),
      company({ id: 5, name: "Beta" }),
    ]);
    // Trois Alpha → 2 en trop ; deux Beta → 1 en trop.
    expect(countRedundant(groups)).toBe(3);
  });
});
