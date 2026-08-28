import {
  buildContractPayload,
  buildContractRef,
  buildSepaMandateReference,
  formatFrenchDate,
  formatUnitPrice,
} from "./contractPayload";
import type { Company, Contract, Sale } from "../types";

const NOW = new Date(2026, 7, 28); // 28 août 2026

const company = {
  name: "Hôpital Européen",
  tax_identifier: "12345678900011",
  vat_number: "FR12345678900",
  address: "6 rue Désirée Clary",
  zipcode: "13003",
  city: "Marseille",
} as unknown as Company;

const nosho = {
  first_name: "Thomas",
  last_name: "Guillaumin",
  job_title: "Président",
} as unknown as Sale;

const base = {
  kind: "cadre",
  signatory_first_name: "Virginie",
  signatory_last_name: "Roger",
  signatory_job_title: "Directrice de la Transition Numérique",
  signatory_email: "v.roger@hopital-europeen.fr",
  offer_label: "Forfait confirmation",
  offer_detail: "Appel sortant de confirmation, par rendez-vous traité",
  unit_price_cents: 25,
  price_unit: "confirmation",
  commitment_months: 12,
  renewal_months: 12,
  notice_days: 30,
} as unknown as Partial<Contract>;

describe("formatUnitPrice", () => {
  it("rend les centimes en euros, virgule française", () => {
    // Le tarif HEM. Stocké en centimes précisément pour ce moment : 0,25 en
    // flottant vaut 0,2500000000000001.
    expect(formatUnitPrice(25)).toBe("0,25 €");
    expect(formatUnitPrice(40)).toBe("0,40 €");
  });

  it("omet les décimales sur un montant rond", () => {
    // « 30 € / mois » de la grille de référence, pas « 30,00 € ».
    expect(formatUnitPrice(3000)).toBe("30 €");
    expect(formatUnitPrice(50000)).toBe("500 €");
  });

  it("ne rend rien plutôt qu'un zéro trompeur", () => {
    expect(formatUnitPrice(null)).toBeUndefined();
    expect(formatUnitPrice(undefined)).toBeUndefined();
  });
});

describe("références", () => {
  it("écrit la RUM au format déjà en usage", () => {
    // Le mandat existant porte `NOSHO-2025-CST002`.
    expect(buildSepaMandateReference(42, 2026)).toBe("NOSHO-2026-042");
    expect(buildSepaMandateReference(7, 2026)).toBe("NOSHO-2026-007");
  });

  it("ne tronque pas un identifiant à quatre chiffres", () => {
    expect(buildSepaMandateReference(1234, 2026)).toBe("NOSHO-2026-1234");
  });

  it("rattache le contrat à son opportunité", () => {
    expect(buildContractRef(42, 2026)).toBe("NSH-C-2026-42");
  });
});

describe("formatFrenchDate", () => {
  it("écrit la date comme les contrats existants", () => {
    expect(formatFrenchDate(NOW)).toBe("28 août 2026");
  });
});

describe("buildContractPayload", () => {
  const payload = buildContractPayload({
    contract: base,
    company,
    noshoSignatory: nosho,
    legal: { legalForm: "SAS", rcsCity: "Marseille" },
    dealId: 42,
    now: NOW,
  });

  it("reprend l'identité du client sans la retaper", () => {
    expect(payload.client.name).toBe("Hôpital Européen");
    expect(payload.client.siret).toBe("12345678900011");
    expect(payload.client.vatNumber).toBe("FR12345678900");
  });

  it("laisse passer ce que Pappers rend au moment de la génération", () => {
    // Forme juridique et RCS ne sont pas stockés : ils changent sans que le
    // CRM en soit informé, et le contrat doit porter l'état du jour.
    expect(payload.client.legalForm).toBe("SAS");
    expect(payload.client.rcsCity).toBe("Marseille");
  });

  it("porte le signataire Nosho avec sa fonction", () => {
    expect(payload.noshoSignatoryName).toBe("Thomas Guillaumin");
    expect(payload.noshoSignatoryJobTitle).toBe("Président");
  });

  it("formate le prix, le gabarit n'a rien à calculer", () => {
    expect(payload.offer?.unitPrice).toBe("0,25 €");
    expect(payload.offer?.unit).toBe("confirmation");
  });

  it("n'expose aucune date de fin", () => {
    // L'article 7 pose une période ferme comptée depuis la mise en production
    // puis une tacite reconduction : une date de fin serait un chiffre faux.
    expect(Object.keys(payload)).not.toContain("endDate");
    expect(JSON.stringify(payload)).not.toMatch(/endDate|dateFin/);
    expect(payload.commitmentMonths).toBe(12);
    expect(payload.renewalMonths).toBe(12);
    expect(payload.noticeDays).toBe(30);
  });

  it("génère une RUM sur le contrat cadre", () => {
    expect(payload.sepaMandateReference).toBe("NOSHO-2026-042");
  });

  it("n'en génère aucune sur un POC", () => {
    // Le POC est gratuit : il n'y a rien à prélever.
    const poc = buildContractPayload({
      contract: { ...base, kind: "poc" },
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(poc.sepaMandateReference).toBeUndefined();
    expect(poc.kind).toBe("poc");
  });

  it("conserve une RUM déjà attribuée plutôt que d'en forger une autre", () => {
    // La banque du débiteur a enregistré celle-ci : la changer casserait le
    // mandat.
    const existing = buildContractPayload({
      contract: { ...base, sepa_mandate_reference: "NOSHO-2025-CST002" },
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(existing.sepaMandateReference).toBe("NOSHO-2025-CST002");
  });
});
