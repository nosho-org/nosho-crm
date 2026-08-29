import type { Company, Contract, Sale } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Le contrat d'interface avec `doc.nosho.org` (NOS-1156)
 * ---------------------------------------------------------------------------
 * Ce module définit **les variables que les gabarits reçoivent**. C'est le
 * point d'accord entre le CRM et le service documentaire : tout nom de champ
 * écrit ici doit exister dans le gabarit, et réciproquement.
 *
 * Il est isolé dans son propre fichier, et testé, pour cette raison : un
 * renommage silencieux ici produit un contrat où un champ reste vide, ce que
 * personne ne remarque avant de l'avoir envoyé au client. C'est exactement ce
 * qui est arrivé au contrat de référence HEM, parti chez le client avec un
 * `[SIREN / FINESS HEM]` jamais rempli page 3.
 *
 * ## Ce qui n'est PAS ici, et pourquoi
 *
 * **Aucune date de fin.** L'article 7 pose une période ferme comptée depuis la
 * mise en production, puis une tacite reconduction par périodes de 12 mois. Un
 * champ « date de fin » donnerait un chiffre faux à quiconque le lirait.
 *
 * **Aucune constante Nosho** hors le signataire. Raison sociale, capital, RCS,
 * adresse, ICS : ils appartiennent au gabarit. Les faire transiter par le CRM
 * ferait de chaque contrat une occasion de les contredire.
 */

/** Identité de la société cliente, telle qu'elle apparaît au bloc « parties ». */
export interface ContractClientPayload {
  name: string;
  /** « Établissement de santé », « Cabinet dentaire »… */
  qualification?: string;
  siret?: string;
  vatNumber?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  /** Depuis Pappers au moment de la génération, jamais stocké. */
  legalForm?: string;
  shareCapital?: string;
  rcsNumber?: string;
  rcsCity?: string;
  apeCode?: string;
  /**
   * Le client signe en nom propre — un praticien en entreprise individuelle,
   * comme Aboulker dans le contrat POC de reference.
   *
   * Le bloc « parties » s ecrit alors sans capital ni representant : il n y a
   * pas de personne morale a representer.
   */
  isIndividual?: boolean;
}

/** La personne qui engage le client. Son e-mail reçoit la demande de signature. */
export interface ContractSignatoryPayload {
  firstName?: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
}

/**
 * Une ligne du tableau tarifaire de l'article 3.
 *
 * Le modèle initial n'en portait qu'une, reprise du contrat HEM qui ne vend
 * qu'un service. Un client peut prendre l'agent de confirmation **et** l'agent
 * de secrétariat, à deux prix et deux unités : le gabarit reçoit donc un
 * tableau, et non un triplet.
 */
export interface ContractServicePayload {
  /** « Agent de confirmation de rendez-vous ». */
  label: string;
  /** « 0,25 € » — déjà formaté, pour que le gabarit n'ait rien à calculer. */
  unitPrice?: string;
  /** « rendez-vous traité », « appel entrant », « mois ». */
  unit?: string;
  /** Commentaire libre, sous la ligne. Remplace l'ancien « détail ». */
  comment?: string;
}

/** Les bornes de la periode d essai. Le POC en a, le contrat cadre non. */
export interface ContractTrialPayload {
  /** « lundi 31 aout 2026 » : le jour de la semaine figure au contrat. */
  startDate?: string;
  endDate?: string;
  /** « deux (2) », ecrit en toutes lettres suivi du chiffre. */
  weeks?: string;
}

export interface ContractPayload {
  /** `poc` ou `cadre` : le service choisit le gabarit là-dessus. */
  kind: string;
  /** `NSH-C-2026-42`, lisible et rattachable à l'opportunité. */
  contractRef: string;
  /** « 28 août 2026 ». */
  contractDate: string;
  client: ContractClientPayload;
  signatory: ContractSignatoryPayload;
  /** Référent opérationnel, distinct du signataire dans le contrat cadre. */
  referentEmail?: string;
  /** Nom et fonction du signataire Nosho — le reste est dans le gabarit. */
  noshoSignatoryName?: string;
  noshoSignatoryJobTitle?: string;
  /** Les lignes de prestation. Vide quand le contrat est gratuit. */
  services: ContractServicePayload[];
  /**
   * Contrat sans facturation.
   *
   * Ce n'est pas un affichage : l'article 5 du POC écrit « Aucun montant, à
   * quelque titre que ce soit, ne pourra être facturé au Client au titre de
   * celle-ci ». Le gabarit branche sur ce booléen, il ne se contente pas de
   * masquer un prix.
   */
  isFree?: boolean;
  commitmentMonths?: number;
  renewalMonths?: number;
  noticeDays?: number;
  /**
   * Contrat POC seulement.
   *
   * Le POC a de vraies bornes — « prend effet le lundi 31 août 2026 […]
   * jusqu'au dimanche 13 septembre 2026 inclus » — là où le contrat cadre n'a
   * pas de fin, sa période ferme courant depuis la mise en production.
   *
   * Lacune révélée en écrivant les gabarits : le modèle ne prévoyait que les
   * durées du contrat cadre.
   */
  trial?: ContractTrialPayload;
  /** Contrat cadre seulement. L'ICS reste une constante du gabarit. */
  sepaMandateReference?: string;
}

const FR_MONTHS = [
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

/** « 28 août 2026 », comme les contrats existants l'écrivent. */
export function formatFrenchDate(date: Date): string {
  return `${date.getDate()} ${FR_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

const FR_WEEKDAYS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

/**
 * « lundi 31 août 2026 » depuis un `date` PostgreSQL (`2026-08-31`).
 *
 * Le jour de la semaine figure au contrat, et il n'y est pas décoratif : sur
 * une période d'essai de deux semaines, il rend visible qu'on démarre un lundi
 * et qu'on finit un dimanche.
 *
 * Lecture en UTC de bout en bout. Une colonne `date` n'a pas d'heure ; la lire
 * dans le fuseau du navigateur ferait basculer la veille au soir tout
 * utilisateur à l'ouest de Greenwich, et le contrat afficherait un jour de
 * décalage sans que rien ne le signale.
 */
export function formatFrenchDateWithWeekday(iso: string): string | undefined {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${FR_WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${
    FR_MONTHS[date.getUTCMonth()]
  } ${date.getUTCFullYear()}`;
}

/** « deux (2) » — lettres puis chiffre, la forme que le contrat emploie. */
const WEEKS_IN_WORDS: Record<number, string> = {
  1: "une (1)",
  2: "deux (2)",
  3: "trois (3)",
  4: "quatre (4)",
  6: "six (6)",
  8: "huit (8)",
};

/**
 * Les bornes de la période d'essai, ou `undefined` si le contrat n'en a pas.
 *
 * `weeks` reste absent quand la durée est personnalisée : le gabarit omet
 * alors la mention « pour une durée de N semaines ». Dix jours ne font pas un
 * nombre entier de semaines, et arrondir écrirait une phrase en désaccord avec
 * la date qui la suit.
 */
function buildTrialPayload(
  contract: Partial<Contract>,
): ContractTrialPayload | undefined {
  if (!contract.trial_start_date && !contract.trial_end_date) return undefined;
  return {
    startDate: contract.trial_start_date
      ? formatFrenchDateWithWeekday(contract.trial_start_date)
      : undefined,
    endDate: contract.trial_end_date
      ? formatFrenchDateWithWeekday(contract.trial_end_date)
      : undefined,
    weeks:
      contract.trial_weeks != null
        ? (WEEKS_IN_WORDS[contract.trial_weeks] ?? String(contract.trial_weeks))
        : undefined,
  };
}

/**
 * Prix en toutes lettres depuis les centimes.
 *
 * Stocké en centimes précisément pour ce moment : 0,25 € en flottant vaut
 * 0,2500000000000001, et un contrat ne se discute pas sur une approximation
 * binaire. La virgule française, pas le point.
 */
export function formatUnitPrice(
  cents: number | null | undefined,
): string | undefined {
  if (cents == null || !Number.isFinite(cents)) return undefined;
  const euros = cents / 100;
  const decimals = cents % 100 === 0 ? 0 : 2;
  return `${euros.toFixed(decimals).replace(".", ",")} €`;
}

/**
 * Référence unique de mandat, au format déjà en usage : `NOSHO-2025-CST002`.
 *
 * Un identifiant d'opportunité plutôt qu'un compteur : il est unique par
 * construction, et il permet de remonter au dossier depuis un relevé bancaire.
 * La contrainte d'unicité en base est le vrai garde-fou — la banque du
 * débiteur enregistre cette référence, et deux mandats qui la partagent se
 * télescopent.
 */
export function buildSepaMandateReference(
  dealId: number,
  year: number,
): string {
  return `NOSHO-${year}-${String(dealId).padStart(3, "0")}`;
}

/** Référence du contrat, sur le modèle des propositions (`NSH-2026-42`). */
export function buildContractRef(dealId: number, year: number): string {
  return `NSH-C-${year}-${dealId}`;
}

/**
 * Assemble ce que le service documentaire recevra.
 *
 * `legal` arrive de Pappers au moment de la génération et n'est pas stocké :
 * forme juridique, capital et RCS changent sans que le CRM en soit informé, et
 * un contrat doit porter l'état du registre le jour où il est édité.
 */
export function buildContractPayload(args: {
  contract: Partial<Contract>;
  company: Pick<
    Company,
    "name" | "tax_identifier" | "vat_number" | "address" | "zipcode" | "city"
  > & { qualification?: string };
  noshoSignatory: Pick<Sale, "first_name" | "last_name"> & {
    job_title?: string | null;
  };
  legal?: Partial<
    Pick<
      ContractClientPayload,
      "legalForm" | "shareCapital" | "rcsNumber" | "rcsCity" | "apeCode"
    >
  >;
  dealId: number;
  now: Date;
}): ContractPayload {
  const { contract, company, noshoSignatory, legal, dealId, now } = args;
  const year = now.getFullYear();

  return {
    kind: contract.kind ?? "poc",
    contractRef: buildContractRef(dealId, year),
    contractDate: formatFrenchDate(now),
    client: {
      name: company.name,
      qualification: company.qualification,
      siret: company.tax_identifier || undefined,
      vatNumber: company.vat_number || undefined,
      address: company.address || undefined,
      zipcode: company.zipcode || undefined,
      city: company.city || undefined,
      ...legal,
    },
    signatory: {
      firstName: contract.signatory_first_name ?? undefined,
      lastName: contract.signatory_last_name ?? undefined,
      jobTitle: contract.signatory_job_title ?? undefined,
      email: contract.signatory_email ?? undefined,
    },
    referentEmail: contract.referent_email ?? undefined,
    noshoSignatoryName:
      `${noshoSignatory.first_name} ${noshoSignatory.last_name}`.trim() ||
      undefined,
    noshoSignatoryJobTitle: noshoSignatory.job_title ?? undefined,
    /*
     * Les lignes partent même quand le contrat est gratuit.
     *
     * L'article 5 du POC de référence le fait explicitement : « À titre
     * purement indicatif et sans valeur d'engagement, les conditions
     * applicables en cas de poursuite seraient les suivantes ». Le prix y a un
     * rôle — annoncer la suite — que `isFree` qualifie sans le supprimer.
     */
    services: (contract.services ?? []).map((line) => ({
      label: line.label,
      unitPrice: formatUnitPrice(line.unitPriceCents),
      unit: line.unit ?? undefined,
      comment: line.comment ?? undefined,
    })),
    isFree: contract.is_free ?? false,
    trial: buildTrialPayload(contract),
    commitmentMonths: contract.commitment_months ?? undefined,
    renewalMonths: contract.renewal_months ?? undefined,
    noticeDays: contract.notice_days ?? undefined,
    // Uniquement sur le contrat cadre : le POC est gratuit, il n'y a rien à
    // prélever.
    sepaMandateReference:
      contract.kind === "cadre"
        ? (contract.sepa_mandate_reference ??
          buildSepaMandateReference(dealId, year))
        : undefined,
  };
}
