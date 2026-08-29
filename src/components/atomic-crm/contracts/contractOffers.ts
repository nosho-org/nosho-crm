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
 * Le nombre de semaines entre deux bornes incluses, ou `null`.
 *
 * La durée n'est plus demandée : le menu déroulant « une semaine / deux
 * semaines / personnalisée » doublait les deux dates, qui suffisent à la dire.
 * Elle se déduit donc, et sert au seul endroit où elle a un rôle — la
 * formulation de l'article 2, « pour une durée de deux (2) semaines ».
 *
 * Bornes incluses, comme le contrat les écrit : « prend effet le lundi
 * 31 août 2026 […] jusqu'au dimanche 13 septembre 2026 inclus » — 13 jours
 * d'écart, donc 14 jours comptés, donc deux semaines.
 *
 * `null` dès que la durée n'est pas un nombre entier de semaines. Le gabarit
 * omet alors la mention plutôt que d'arrondir : dix jours ne font pas une
 * semaine et demie, et l'écrire donnerait une phrase en désaccord avec la date
 * qui la suit.
 */
export function weeksBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const from = new Date(`${start}T00:00:00Z`);
  const to = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
  if (days <= 0 || !Number.isInteger(days) || days % 7 !== 0) return null;
  return days / 7;
}
