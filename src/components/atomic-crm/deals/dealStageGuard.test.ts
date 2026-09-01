import type { DataProvider } from "ra-core";

import {
  companyIsIdentified,
  countDealsMissingSiret,
  siretRequiredMessage,
  stageRequiresSiret,
} from "./dealStageGuard";

/** `getMany` factice : seule cette méthode est utilisée par le garde-fou. */
const providerWith = (
  companies: { id: number; tax_identifier: string | null }[],
) =>
  ({
    // `getMany(resource, params)` : la ressource arrive en premier, et lire
    // `ids` sur elle rendait `undefined` sans que rien ne le signale.
    getMany: async (
      _resource: string,
      { ids }: { ids: (string | number)[] },
    ) => ({
      data: companies.filter((c) =>
        ids.map(String).includes(String(c.id)),
      ) as never[],
    }),
  }) as unknown as DataProvider;

describe("stageRequiresSiret", () => {
  it("exige le SIRET de Démo / POC jusqu'à Close Won", () => {
    expect(stageRequiresSiret("demo-poc")).toBe(true);
    expect(stageRequiresSiret("proposal")).toBe(true);
    expect(stageRequiresSiret("negociation")).toBe(true);
    expect(stageRequiresSiret("closed-won")).toBe(true);
  });

  it("laisse les étapes d'entrée libres", () => {
    // Deux seuils ont été essayés puis abandonnés sur mesure : à la
    // création, 46 des 53 opportunités auraient été refusées ; à Qualifié,
    // 28 des 37 affaires qualifiées restaient en infraction. On entre et on
    // qualifie librement, on ne démarre pas un POC sur un établissement
    // qu'on n'a pas identifié (NOS-1227).
    expect(stageRequiresSiret("a-reclasser")).toBe(false);
    expect(stageRequiresSiret("lead")).toBe(false);
    expect(stageRequiresSiret("qualified")).toBe(false);
  });

  it("ne bloque jamais la fermeture d'une affaire", () => {
    // Empêcher de classer en perdu faute de SIRET laisserait l'affaire pourrir
    // dans le pipeline en gonflant les prévisions — le contrôle produirait le
    // mensonge qu'il prétend empêcher.
    expect(stageRequiresSiret("lost")).toBe(false);
    expect(stageRequiresSiret("churn")).toBe(false);
  });

  it("traite l'absence d'étape comme non contrainte", () => {
    expect(stageRequiresSiret(null)).toBe(false);
    expect(stageRequiresSiret(undefined)).toBe(false);
    expect(stageRequiresSiret("")).toBe(false);
  });
});

describe("companyIsIdentified", () => {
  it("accepte un SIRET renseigné", () => {
    expect(companyIsIdentified({ tax_identifier: "91253475700014" })).toBe(
      true,
    );
  });

  it("refuse le vide, les espaces et l'absence", () => {
    // Les espaces comptent : un champ contenant " " passerait une simple
    // vérification de présence tout en n'identifiant rien.
    expect(companyIsIdentified({ tax_identifier: "" })).toBe(false);
    expect(companyIsIdentified({ tax_identifier: "   " })).toBe(false);
    expect(companyIsIdentified(null)).toBe(false);
    expect(companyIsIdentified(undefined)).toBe(false);
  });
});

describe("countDealsMissingSiret", () => {
  const provider = providerWith([
    { id: 1, tax_identifier: "91253475700014" },
    { id: 2, tax_identifier: null },
    { id: 3, tax_identifier: "  " },
  ]);

  it("ne compte rien sur une étape non contrainte", async () => {
    // Et surtout : n'interroge pas le dataProvider pour rien.
    const jamais = { getMany: () => Promise.reject(new Error("appelé")) };
    await expect(
      countDealsMissingSiret(
        jamais as unknown as DataProvider,
        [{ company_id: 2 }],
        "lead",
      ),
    ).resolves.toBe(0);
  });

  it("laisse passer une société identifiée", async () => {
    await expect(
      countDealsMissingSiret(provider, [{ company_id: 1 }], "demo-poc"),
    ).resolves.toBe(0);
  });

  it("compte les sociétés sans SIRET, espaces compris", async () => {
    await expect(
      countDealsMissingSiret(
        provider,
        [{ company_id: 2 }, { company_id: 3 }],
        "demo-poc",
      ),
    ).resolves.toBe(2);
  });

  it("compte une opportunité sans société du tout", async () => {
    // Sans société, rien ne peut l'identifier : elle est bloquée au même titre.
    await expect(
      countDealsMissingSiret(
        provider,
        [{ company_id: null }, { company_id: undefined }, {}],
        "demo-poc",
      ),
    ).resolves.toBe(3);
  });

  it("ne compte que ce qui bloque dans un lot mixte", async () => {
    await expect(
      countDealsMissingSiret(
        provider,
        [{ company_id: 1 }, { company_id: 2 }, { company_id: 1 }],
        "closed-won",
      ),
    ).resolves.toBe(1);
  });

  it("compare les identifiants sans se soucier de leur type", async () => {
    // Les listes rendent des identifiants tantôt nombres, tantôt chaînes.
    await expect(
      countDealsMissingSiret(provider, [{ company_id: "1" }], "demo-poc"),
    ).resolves.toBe(0);
  });
});

describe("siretRequiredMessage", () => {
  it("dit quoi faire et où, pas seulement ce qui est refusé", () => {
    const message = siretRequiredMessage("Démo / POC");
    expect(message).toContain("Démo / POC");
    expect(message).toContain("fiche société");
    expect(message).toContain("Enrichir");
  });

  it("accorde au pluriel et annonce le nombre", () => {
    expect(siretRequiredMessage("Qualifié", 4)).toContain("4 opportunités");
  });
});
