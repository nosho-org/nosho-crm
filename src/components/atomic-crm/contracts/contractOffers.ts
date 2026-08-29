/**
 * ---------------------------------------------------------------------------
 * Ce qui se vend, et à quelle unité (NOS-1156)
 * ---------------------------------------------------------------------------
 * Remplace la grille d'offres de référence (Essentiel / Avancé / Hôpital /
 * Pay-per-use) reprise de l'article 3 du contrat cadre.
 *
 * Cette grille décrivait des **paliers de prix**, là où un contrat se négocie
 * par **prestation** : un client peut prendre l'agent de secrétariat et l'agent
 * de confirmation, à deux prix et deux unités différentes. Un palier unique ne
 * pouvait pas dire ça, et pré-remplir un prix depuis la typologie de
 * l'établissement suggérait un tarif que personne n'avait négocié.
 *
 * Aucun prix n'est donc suggéré ici. Le catalogue nomme les services et les
 * unités ; le montant se saisit.
 */

export interface ContractServiceChoice {
  value: string;
  label: string;
  /** Unité par défaut de ce service — modifiable à la saisie. */
  defaultUnit: string;
}

/**
 * Les services au catalogue.
 *
 * `autre` n'est pas un trou dans la liste, c'est une entrée à part entière :
 * une prestation hors catalogue se saisit sous son propre nom plutôt que de
 * forcer un rangement approximatif dans l'un des deux autres.
 */
export const CONTRACT_SERVICES: ContractServiceChoice[] = [
  {
    value: "confirmation-rdv",
    label: "Agent de confirmation de rendez-vous",
    defaultUnit: "rendez-vous traité",
  },
  {
    value: "secretariat",
    label: "Agent de secrétariat",
    defaultUnit: "appel entrant",
  },
  {
    value: "autre",
    label: "Autre prestation",
    defaultUnit: "mois",
  },
];

/**
 * Unités de facturation.
 *
 * Les deux premières sont celles que Simon a nommées, et elles distinguent
 * bien deux modèles : on facture le rendez-vous qu'on traite en sortant, on
 * facture l'appel qu'on reçoit en entrant. Les suivantes restent parce que les
 * contrats existants s'en servent — « par confirmation » est l'unité du
 * contrat HEM, et un forfait mensuel reste un forfait mensuel.
 */
export const CONTRACT_PRICE_UNITS = [
  { value: "rendez-vous traité", label: "par rendez-vous traité" },
  { value: "appel entrant", label: "par appel entrant" },
  { value: "confirmation", label: "par confirmation" },
  { value: "mois", label: "par mois" },
  { value: "an", label: "par an" },
];

/**
 * Durées proposées pour la période d'essai du POC.
 *
 * `null` = personnalisée : la date de fin se saisit alors directement, et le
 * gabarit omet la mention « pour une durée de N semaines ». Une période de dix
 * jours n'est pas un nombre entier de semaines, et l'arrondir produirait une
 * phrase en désaccord avec la date qui la suit.
 */
export const CONTRACT_TRIAL_DURATIONS: {
  value: string;
  label: string;
  weeks: number | null;
}[] = [
  { value: "1", label: "Une semaine", weeks: 1 },
  { value: "2", label: "Deux semaines", weeks: 2 },
  { value: "custom", label: "Personnalisée", weeks: null },
];

/** « deux (2) » — la forme que le contrat emploie, lettres puis chiffre. */
const WEEKS_IN_WORDS: Record<number, string> = {
  1: "une (1)",
  2: "deux (2)",
  3: "trois (3)",
  4: "quatre (4)",
  6: "six (6)",
  8: "huit (8)",
};

export function weeksInWords(weeks: number | null | undefined): string | null {
  if (weeks == null) return null;
  return WEEKS_IN_WORDS[weeks] ?? `${weeks}`;
}

/**
 * Fin d'une période d'essai de N semaines commencée le `start`.
 *
 * Bornes incluses, comme le contrat les écrit : « prend effet le lundi
 * 31 août 2026 […] jusqu'au dimanche 13 septembre 2026 inclus » — deux semaines
 * font donc 13 jours d'écart, pas 14. Le dernier jour est veille
 * d'anniversaire, sinon le POC durerait quinze jours.
 */
export function trialEndDate(start: string, weeks: number): string | null {
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + weeks * 7 - 1);
  return date.toISOString().slice(0, 10);
}
