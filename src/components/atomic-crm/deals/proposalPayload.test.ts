import type { Company, Contact, Deal, Sale } from "../types";
import {
  buildProposalPayload,
  buildProposalRef,
  formatEuros,
  formatFrenchDate,
} from "./proposalPayload";

/**
 * `Intl` compose les montants avec des espaces INSECABLES : U+202F pour les
 * milliers, U+00A0 avant le symbole. Les comparer a des espaces ordinaires
 * echoue sur une difference invisible a la lecture.
 */
const esp = (valeur: string | undefined) =>
  valeur?.replace(/[  ]/g, " ");

const now = new Date("2026-08-30T10:00:00Z");

const deal = (over: Partial<Deal> = {}): Deal =>
  ({ id: 33, amount: 12000, mrr: 1000, description: null, ...over }) as Deal;

const company = (over = {}) =>
  ({ name: "Clinique de Bonneveine", sector: "Clinique", ...over }) as Pick<
    Company,
    "name" | "sector"
  >;

const construire = (over: Record<string, unknown> = {}) =>
  buildProposalPayload({
    deal: deal(),
    company: company(),
    contact: { first_name: "Nathalie", last_name: "Ginestrier" } as Contact,
    sales: {
      first_name: "Simon",
      last_name: "Sallandre",
      job_title: "Directeur des ventes",
    } as Sale & { job_title: string },
    now,
    ...over,
  });

describe("formatEuros", () => {
  it("omet les décimales sur un montant rond", () => {
    expect(esp(formatEuros(90))).toBe("90 €");
  });

  it("les garde quand il y en a", () => {
    expect(esp(formatEuros(90.5))).toBe("90,50 €");
  });
});

describe("formatFrenchDate", () => {
  it("écrit le mois en toutes lettres", () => {
    expect(formatFrenchDate(new Date("2026-08-30T12:00:00Z"))).toBe(
      "30 août 2026",
    );
  });
});

describe("buildProposalRef", () => {
  it("suit la même règle que la référence de contrat", () => {
    expect(buildProposalRef(33, 2026)).toBe("NSH-2026-33");
  });
});

describe("buildProposalPayload", () => {
  it("n'invente AUCUN chiffrage", () => {
    /*
     * Le motif de tout ce module. Le document parti chez Bonneveine affichait
     * 400 rendez-vous par mois, 12 % de no-shows et 80 € le rendez-vous —
     * aucun de ces chiffres n'ayant jamais été saisi nulle part.
     */
    expect(construire().gains).toBeUndefined();
  });

  it("affiche le MRR comme total mensuel", () => {
    expect(esp(construire().monthlyTotal)).toBe("1 000 €");
  });

  it("ramène l'ARR au mois quand le MRR manque", () => {
    // Afficher un ARR sur une ligne « total mensuel » ferait lire douze fois
    // le prix réel.
    const payload = construire({ deal: deal({ mrr: null, amount: 12000 }) });
    expect(esp(payload.monthlyTotal)).toBe("1 000 €");
  });

  it("n'affiche aucun total quand l'opportunité ne porte pas de montant", () => {
    const payload = construire({
      deal: deal({ mrr: null, amount: undefined }),
    });
    expect(payload.monthlyTotal).toBeUndefined();
  });

  it("ne met pas de prix sur les lignes de produit", () => {
    // Le CRM porte un montant global. Le répartir entre les produits serait
    // une invention.
    const payload = construire({ productLabels: ["No-show", "Entrant"] });
    expect(payload.services).toEqual([
      { label: "No-show" },
      { label: "Entrant" },
    ]);
  });

  it("reprend la description de l'opportunité comme périmètre spécifique", () => {
    const payload = construire({
      deal: deal({ description: "  Deux agendas.  " }),
    });
    expect(payload.scope).toBe("Deux agendas.");
  });

  it("n'invente pas de périmètre quand la description est vide", () => {
    expect(construire({ deal: deal({ description: "   " }) }).scope).toBeUndefined();
  });

  it("nomme l'équipe quand aucun commercial n'est rattaché", () => {
    expect(construire({ sales: null }).sender.name).toBe("L'équipe Nosho");
  });

  it("se passe de contact sans en inventer un", () => {
    expect(construire({ contact: null }).contact.name).toBeUndefined();
  });
});
