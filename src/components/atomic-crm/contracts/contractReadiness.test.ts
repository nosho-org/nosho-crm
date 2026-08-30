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

  it("génère SANS la ville du RCS", () => {
    /*
     * Simon : « c'est quoi la ville du RCS, c'est même pas un champ au niveau
     * de l'objet société, faut pas que ça bloque ».
     *
     * Il a raison sur les deux points. C'est le greffe d'immatriculation, il
     * ne se saisit nulle part dans le CRM, et un contrat se tient sans lui :
     * « immatriculée au RCS sous le numéro 123456789 » reste exact.
     */
    const etat = verifier(contratComplet, {
      ...societeComplete,
      rcs_city: null,
    } as Company);
    expect(etat.aCorriger, etat.aCorriger.join(", ")).toEqual([]);
    expect(etat.ready).toBe(true);
  });

  it("génère SANS la fonction du signataire", () => {
    // La mention disparaît de la phrase plutôt que de laisser un blanc — et
    // surtout plutôt que d'empêcher le document de sortir.
    const etat = verifier({ ...contratComplet, signatory_job_title: null });
    expect(etat.aCorriger, etat.aCorriger.join(", ")).toEqual([]);
    expect(etat.ready).toBe(true);
  });

  it("refuse toujours sans signataire client", () => {
    // La limite : quelqu'un doit signer. Un contrat sans nom de signataire
    // n'est pas un contrat degradé, c'est un contrat vide.
    const etat = verifier({
      ...contratComplet,
      signatory_first_name: null,
      signatory_last_name: null,
    });
    expect(etat.ready).toBe(false);
    expect(etat.aCorriger).toContain("le prénom du signataire client");
  });
  it("refuse un genre de contrat sans gabarit", () => {
    const etat = verifier({ ...contratComplet, kind: "inconnu" });
    expect(etat.ready).toBe(false);
  });
});
