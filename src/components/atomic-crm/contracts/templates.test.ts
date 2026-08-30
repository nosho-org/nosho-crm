import { readFileSync } from "node:fs";
import { renderTemplate } from "./renderTemplate";

/**
 * ---------------------------------------------------------------------------
 * Les gabarits réels, passés au moteur (NOS-1189)
 * ---------------------------------------------------------------------------
 * Ces tests lisent `docs/contract-templates/*.html` et non une copie : ce sont
 * ces fichiers-là qui partent chez le client, et un test sur une doublure ne
 * dirait rien d'utile.
 *
 * Ils protègent trois choses, dans l'ordre de gravité :
 *
 * 1. **Aucune section non rédigée.** Le contrat cadre a vécu avec six articles
 *    vides — sécurité, continuité, RGPD, responsabilités — qui se seraient
 *    téléchargés sans un mot. Un contrat sans article de responsabilité se
 *    signe aussi bien qu'un autre, jusqu'au litige.
 *
 * 2. **Aucune variable non résolue** avec une charge complète. C'est le défaut
 *    qui a envoyé « [SIREN / FINESS HEM] » chez l'Hôpital Européen.
 *
 * 3. **Les annexes sont là.** L'article 13 les déclare « parties intégrantes ».
 *    Un contrat qui en annonce sept et n'en contient aucune est incomplet au
 *    sens propre.
 */

const GABARITS = ["contrat-poc", "contrat-cadre"] as const;

const lire = (nom: string) =>
  readFileSync(`docs/contract-templates/${nom}.html`, "utf8");

/** Une charge complète : tout ce qu'un contrat signé porte réellement. */
const contexteComplet = {
  contractRef: "NSH-2026-33",
  contractDate: "30 août 2026",
  client: {
    name: "Hôpital Européen",
    siret: "12345678900012",
    vatNumber: "FR12345678900",
    address: "6 rue Désirée Clary",
    zipcode: "13003",
    city: "Marseille",
    legalForm: "GIE",
    shareCapital: "10 000",
    rcsNumber: "123456789",
    rcsCity: "Marseille",
    apeCode: "8610Z",
    isIndividual: false,
    qualification: "établissement de santé",
  },
  signatory: {
    firstName: "Virginie",
    lastName: "Roger",
    jobTitle: "Directrice de la Transition Numérique",
  },
  noshoSignatoryName: "Thomas GUILLAUMIN",
  noshoSignatoryJobTitle: "Président",
  services: [
    {
      label: "Agent de confirmation de RDV",
      unitPrice: "1,50 €",
      unit: "par rdv traité",
      comment: "Périmètre chirurgie vasculaire.",
    },
  ],
  isFree: false,
  unitPrice: "1,50 €",
  unit: "par rdv traité",
  comment: "Déploiement sur deux agendas.",
  trial: {
    startDate: "lundi 1 septembre 2026",
    endDate: "dimanche 14 septembre 2026",
    weeks: 2,
  },
  commitmentMonths: 12,
  renewalMonths: 12,
  noticeDays: 30,
  referentEmail: "v.roger@hopital-europeen.fr",
  sepaMandateReference: "NSH-RUM-2026-33",
};

describe.each(GABARITS)("gabarit %s", (nom: (typeof GABARITS)[number]) => {
  const gabarit = lire(nom);

  it("ne contient aucune section restée à rédiger", () => {
    expect(gabarit).not.toMatch(/TEXTE\s+[ÀA]\s+REPRENDRE/i);
  });

  it("se rend sans variable non résolue", () => {
    const { html, missing } = renderTemplate(gabarit, contexteComplet);
    expect(
      missing,
      `variables non fournies : ${missing.join(", ")}`,
    ).toEqual([]);
    expect(html).not.toContain("{{");
  });

  it("ne laisse aucune balise de section ouverte", () => {
    const { html } = renderTemplate(gabarit, contexteComplet);
    const ouvrantes = (html.match(/<section\b/g) ?? []).length;
    const fermantes = (html.match(/<\/section>/g) ?? []).length;
    expect(ouvrantes).toBe(fermantes);
  });
});

describe("contrat POC", () => {
  const gabarit = lire("contrat-poc");

  it("porte les huit articles du contrat de référence", () => {
    // Repris du contrat Aboulker du 25 août 2026.
    for (const titre of [
      "Article 1 — Objet",
      "Article 2 — Durée",
      "Article 3 — Prestations réalisées par Nosho",
      "Article 4 — Prestations à la charge du Client",
      "Article 6 — Données à caractère personnel",
      "Article 7 — Confidentialité et responsabilité",
      "Article 8 — Droit applicable et juridiction",
    ]) {
      expect(gabarit).toContain(titre);
    }
  });

  it("rend un article 5 et un seul, selon la gratuité", () => {
    // Les deux branches coexistent dans le fichier ; une seule doit sortir.
    const gratuit = renderTemplate(gabarit, {
      ...contexteComplet,
      isFree: true,
    }).html;
    const payant = renderTemplate(gabarit, {
      ...contexteComplet,
      isFree: false,
    }).html;

    expect(gratuit).toContain("Gratuité et suites");
    expect(gratuit).not.toContain("Conditions financières");
    expect(payant).toContain("Conditions financières");
    expect(payant).not.toContain("Gratuité et suites");
  });
});

describe("contrat cadre", () => {
  const gabarit = lire("contrat-cadre");

  it("porte les treize articles du contrat de référence", () => {
    for (let n = 1; n <= 13; n++) {
      const numero = String(n).padStart(2, "0");
      expect(gabarit, `article ${numero} absent`).toMatch(
        new RegExp(`<h2>${numero}\\s*—`),
      );
    }
  });

  it("contient les sept annexes, parties intégrantes du contrat", () => {
    // L'article 13 les déclare intégrantes : les annoncer sans les contenir
    // rendrait le contrat incomplet au sens propre.
    for (let n = 1; n <= 7; n++) {
      expect(gabarit, `annexe ${n} absente`).toContain(`id="annexe-${n}"`);
    }
  });

  it("garde les chiffres du contrat de référence", () => {
    // Relevés page à page sur le HEM v2. Une transcription qui les déforme est
    // pire qu'une absence : elle engage.
    const { html } = renderTemplate(gabarit, contexteComplet);
    for (const chiffre of [
      "99,5",          // disponibilité mensuelle
      "≤ 4 h ouvrées", // RTO
      "≤ 24 h",        // RPO
      "72 h",          // notification CNIL
      "AES-256",       // chiffrement au repos
      "TLS 1.3",       // chiffrement en transit
      "RSA-4096",      // accès SSH
    ]) {
      expect(html, `${chiffre} absent du rendu`).toContain(chiffre);
    }
  });
});
