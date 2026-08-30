import type { Company, Contract } from "../types";
import { checkContractReadiness, describeMissing } from "./contractReadiness";

const now = new Date("2026-08-30T10:00:00Z");

const societeComplete = {
  name: "Clinique de Bonneveine",
  tax_identifier: "12345678900012",
  vat_number: "FR12345678900",
  address: "1 rue de la Plage",
  zipcode: "13008",
  city: "Marseille",
  legal_form: "SAS",
  share_capital: "10000",
  rcs_city: "Marseille",
  ape_code: "8610Z",
  is_individual: false,
} as unknown as Company;

const contratComplet: Partial<Contract> = {
  kind: "poc",
  signatory_first_name: "Nathalie",
  signatory_last_name: "Ginestrier",
  signatory_job_title: "Directrice",
  services: [],
  is_free: true,
  trial_start_date: "2026-09-01",
  trial_end_date: "2026-09-14",
  trial_weeks: 2,
};

const verifier = (
  contract: Partial<Contract> = contratComplet,
  company: Company = societeComplete,
) =>
  checkContractReadiness({
    contract,
    company,
    noshoSignatory: {
      first_name: "Thomas",
      last_name: "GUILLAUMIN",
      job_title: "Président",
    },
    dealId: 33,
    now,
  });

describe("describeMissing", () => {
  it("dit OÙ corriger, pas seulement quoi", () => {
    // `client.rcsCity` ne se saisit pas dans la fenêtre de contrat : il se
    // rapatrie du registre. Le chemin technique enverrait à la chasse au
    // trésor.
    expect(describeMissing(["client.rcsCity"])).toEqual([
      "la ville du RCS — bouton Compléter depuis le registre",
    ]);
  });

  it("traduit la fonction du signataire, qui n'était pas dans la table", () => {
    // Simon a reçu le message brut « signatory.jobTitle ».
    expect(describeMissing(["signatory.jobTitle"])).toEqual([
      "la fonction du signataire client",
    ]);
  });

  it("dédoublonne deux chemins qui mènent à la même correction", () => {
    expect(
      describeMissing(["client.legalForm", "client.legalForm"]),
    ).toHaveLength(1);
  });

  it("laisse passer un chemin inconnu plutôt que de le taire", () => {
    expect(describeMissing(["truc.machin"])).toEqual(["truc.machin"]);
  });
});

describe("checkContractReadiness", () => {
  it("accepte un contrat complet", () => {
    const etat = verifier();
    expect(etat.missing, etat.missing.join(", ")).toEqual([]);
    expect(etat.ready).toBe(true);
  });

  it("refuse et nomme la ville du RCS manquante", () => {
    const etat = verifier(contratComplet, {
      ...societeComplete,
      rcs_city: null,
    } as Company);
    expect(etat.ready).toBe(false);
    expect(etat.aCorriger).toContain(
      "la ville du RCS — bouton Compléter depuis le registre",
    );
  });

  it("refuse et nomme la fonction du signataire manquante", () => {
    const etat = verifier({ ...contratComplet, signatory_job_title: null });
    expect(etat.ready).toBe(false);
    expect(etat.aCorriger).toContain("la fonction du signataire client");
  });

  it("cumule les manques plutôt que d'en signaler un seul", () => {
    // Corriger un champ pour en découvrir un autre au clic suivant est le
    // défaut que ce module supprime.
    const etat = verifier(
      { ...contratComplet, signatory_job_title: null },
      { ...societeComplete, rcs_city: null } as Company,
    );
    expect(etat.aCorriger.length).toBeGreaterThanOrEqual(2);
  });

  it("refuse un genre de contrat sans gabarit", () => {
    const etat = verifier({ ...contratComplet, kind: "inconnu" });
    expect(etat.ready).toBe(false);
  });
});
