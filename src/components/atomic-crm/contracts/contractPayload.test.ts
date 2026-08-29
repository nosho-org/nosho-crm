import {
  buildContractPayload,
  buildContractRef,
  buildSepaMandateReference,
  formatFrenchDate,
  formatFrenchDateWithWeekday,
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
  services: [
    {
      service: "confirmation-rdv",
      label: "Agent de confirmation de rendez-vous",
      unitPriceCents: 25,
      unit: "rendez-vous traité",
      comment: "Reprise des créneaux annulés incluse.",
    },
    {
      service: "secretariat",
      label: "Agent de secrétariat",
      unitPriceCents: 90,
      unit: "appel entrant",
    },
  ],
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
    expect(payload.services[0].unitPrice).toBe("0,25 €");
    expect(payload.services[0].unit).toBe("rendez-vous traité");
  });

  it("porte toutes les lignes de prestation, pas seulement la première", () => {
    // Un client peut prendre l'agent de confirmation ET l'agent de
    // secrétariat, à deux prix et deux unités. Le modèle initial n'en
    // portait qu'une, reprise du contrat HEM qui ne vend qu'un service.
    expect(payload.services).toHaveLength(2);
    expect(payload.services[1].label).toBe("Agent de secrétariat");
    expect(payload.services[1].unitPrice).toBe("0,90 €");
  });

  it("garde le commentaire de la ligne, et ne l'invente pas quand il manque", () => {
    expect(payload.services[0].comment).toBe(
      "Reprise des créneaux annulés incluse.",
    );
    expect(payload.services[1].comment).toBeUndefined();
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

describe("formatFrenchDateWithWeekday", () => {
  it("écrit le jour de la semaine, comme le contrat le fait", () => {
    // « prend effet le lundi 31 août 2026 […] jusqu'au dimanche
    // 13 septembre 2026 inclus » : le contrat POC de référence.
    expect(formatFrenchDateWithWeekday("2026-08-31")).toBe(
      "lundi 31 août 2026",
    );
    expect(formatFrenchDateWithWeekday("2026-09-13")).toBe(
      "dimanche 13 septembre 2026",
    );
  });

  it("lit la date en UTC, sans décalage de fuseau", () => {
    // Une colonne `date` n'a pas d'heure. La lire dans le fuseau du
    // navigateur ferait basculer la veille au soir tout utilisateur à
    // l'ouest de Greenwich, et le contrat afficherait un jour de décalage.
    expect(formatFrenchDateWithWeekday("2026-01-01")).toBe(
      "jeudi 1 janvier 2026",
    );
  });
});

describe("période d'essai", () => {
  it("n'en expose aucune quand le contrat n'en a pas", () => {
    const cadre = buildContractPayload({
      contract: base,
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(cadre.trial).toBeUndefined();
  });

  it("porte les deux bornes et la durée en toutes lettres", () => {
    const poc = buildContractPayload({
      contract: {
        ...base,
        kind: "poc",
        trial_start_date: "2026-08-31",
        trial_end_date: "2026-09-13",
        trial_weeks: 2,
      },
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(poc.trial?.startDate).toBe("lundi 31 août 2026");
    expect(poc.trial?.endDate).toBe("dimanche 13 septembre 2026");
    expect(poc.trial?.weeks).toBe("deux (2)");
  });

  it("omet la durée quand elle est personnalisée", () => {
    // Dix jours ne font pas un nombre entier de semaines. Arrondir écrirait
    // « pour une durée de 1 semaines » suivi d'une date en désaccord.
    const poc = buildContractPayload({
      contract: {
        ...base,
        kind: "poc",
        trial_start_date: "2026-08-31",
        trial_end_date: "2026-09-09",
        trial_weeks: null,
      },
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(poc.trial?.weeks).toBeUndefined();
    expect(poc.trial?.endDate).toBe("mercredi 9 septembre 2026");
  });
});

describe("gratuité", () => {
  it("garde les lignes tarifaires, que l'article 5 imprime à titre indicatif", () => {
    // « À titre purement indicatif et sans valeur d'engagement, les
    // conditions applicables en cas de poursuite seraient les suivantes ».
    // Le prix a un rôle sur un contrat gratuit : annoncer la suite.
    const poc = buildContractPayload({
      contract: { ...base, kind: "poc", is_free: true },
      company,
      noshoSignatory: nosho,
      dealId: 42,
      now: NOW,
    });
    expect(poc.isFree).toBe(true);
    expect(poc.services).toHaveLength(2);
  });
});
