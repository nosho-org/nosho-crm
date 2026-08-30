import type { Company, Contact, Deal, Sale } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Ce que la proposition affiche, et rien d'autre (NOS-1192)
 * ---------------------------------------------------------------------------
 * La proposition était produite par `doc.nosho.org`, à qui le CRM n'envoyait
 * que six champs : nom du client, secteur, contact, référence, date,
 * commercial.
 *
 * **Tout le reste était inventé par le générateur.** Le document parti chez la
 * clinique de Bonneveine affichait 400 rendez-vous par mois, 12 % de no-shows,
 * 80 € le rendez-vous et un gain de 32 256 € — sous la mention « estimation
 * basée sur vos volumes déclarés », alors qu'aucun volume n'avait été déclaré
 * nulle part.
 *
 * Ce module ne construit que ce que le CRM porte réellement. Un champ absent
 * de la base est absent du document.
 */

export interface ProposalServiceLine {
  label: string;
  unitPrice?: string;
  unit?: string;
  comment?: string;
}

/**
 * Les hypothèses du chiffrage, quand elles existent.
 *
 * Aucune ne se devine : elles viennent du client, pas d'une moyenne de marché.
 * L'objet entier est absent tant que les trois premières manquent, et la
 * section « bénéfices attendus » disparaît alors du document.
 */
export interface ProposalGains {
  appointmentsPerMonth: string;
  noShowRate: string;
  appointmentValue: string;
  targetReduction: string;
  annualGain: string;
  recoveredPerMonth: string;
}

export interface ProposalPayload {
  proposalRef: string;
  proposalDate: string;
  client: { name: string; sector?: string };
  contact: { name?: string };
  sender: { name: string; jobTitle?: string };
  services: ProposalServiceLine[];
  monthlyTotal?: string;
  scope?: string;
  gains?: ProposalGains;
}

const FR_MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export function formatFrenchDate(date: Date): string {
  return `${date.getDate()} ${FR_MOIS[date.getMonth()]} ${date.getFullYear()}`;
}

/** « 1 250 € ». Sans décimale : un tarif mensuel rond se lit mieux. */
export function formatEuros(montant: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: montant % 1 === 0 ? 0 : 2,
  }).format(montant);
}

/** `NSH-2026-33`, la même règle que la référence de contrat. */
export function buildProposalRef(dealId: number, year: number): string {
  return `NSH-${year}-${dealId}`;
}

function nomComplet(
  personne: { first_name?: string | null; last_name?: string | null } | null,
): string {
  if (!personne) return "";
  return `${personne.first_name ?? ""} ${personne.last_name ?? ""}`.trim();
}

export function buildProposalPayload(args: {
  deal: Deal;
  company: Pick<Company, "name" | "sector">;
  contact: Pick<Contact, "first_name" | "last_name"> | null;
  sales: (Pick<Sale, "first_name" | "last_name"> & {
    job_title?: string | null;
  }) | null;
  /** Le libellé des produits, tel que la configuration les nomme. */
  productLabels?: string[];
  now: Date;
}): ProposalPayload {
  const { deal, company, contact, sales, productLabels, now } = args;

  /*
   * Le MRR de l'opportunité, ou l'ARR ramené au mois.
   *
   * La proposition parle d'un abonnement mensuel : afficher un ARR sur une
   * ligne intitulée « total mensuel » ferait lire douze fois le prix réel.
   */
  const mensuel =
    typeof deal.mrr === "number" && deal.mrr > 0
      ? deal.mrr
      : deal.amount
        ? deal.amount / 12
        : null;

  /*
   * Une ligne par produit retenu sur l'opportunité.
   *
   * Le prix ne figure QUE sur le total : le CRM porte un montant global, pas
   * un prix par produit. Le repartir a parts egales entre les produits serait
   * une invention — exactement ce que ce module existe pour empecher.
   */
  const services: ProposalServiceLine[] = (productLabels ?? []).map(
    (label) => ({ label }),
  );

  return {
    proposalRef: buildProposalRef(Number(deal.id), now.getFullYear()),
    proposalDate: formatFrenchDate(now),
    client: { name: company.name, sector: company.sector ?? undefined },
    contact: { name: nomComplet(contact) || undefined },
    sender: {
      name: nomComplet(sales) || "L'équipe Nosho",
      jobTitle: sales?.job_title ?? undefined,
    },
    services,
    monthlyTotal: mensuel != null ? formatEuros(mensuel) : undefined,
    scope: deal.description?.trim() || undefined,
    // Pas de `gains` : le CRM ne porte ni volume de rendez-vous, ni taux de
    // no-show, ni valeur d'un rendez-vous. La section disparaît du document.
  };
}
