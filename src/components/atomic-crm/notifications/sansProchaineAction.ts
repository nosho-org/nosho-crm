import type { Identifier } from "ra-core";

import type { DealRecord } from "../deals/cockpit/dealFields";

/**
 * ---------------------------------------------------------------------------
 * Compter les affaires sans prochaine action, toutes (NOS-1214)
 * ---------------------------------------------------------------------------
 * Simon : « je ne vois plus les autres notifications sur les autres
 * triggers ».
 *
 * ## Ce que le chiffre comptait vraiment
 *
 * La notification se calculait sur le résultat de `rankDealsByFocus`, qui
 * n'est pas la liste des affaires : c'est un classement, et il écarte au
 * passage tout ce dont le montant pondéré vaut zéro (`weightedAmount <= 0`).
 * Une affaire sans montant, ou dont l'étape porte une probabilité nulle,
 * n'y figure jamais.
 *
 * Le compte annonçait donc « 1 opportunité sans prochaine action » quand la
 * production en portait douze. Un chiffre faux depuis l'origine, que rien ne
 * signalait tant qu'il restait non nul.
 *
 * En retirant du compte l'affaire déjà nommée par la notification de focus
 * (NOS-1210), il ne restait plus rien — et la notification disparaissait au
 * lieu d'annoncer les onze autres. C'est ce que Simon a vu.
 *
 * ## Ce qu'il compte désormais
 *
 * Toutes les affaires à étape ouverte dépourvues de prochaine action, sans
 * condition de montant. Une affaire à 0 € qu'on a oubliée reste une affaire
 * qu'on a oubliée : c'est même souvent le signe qu'elle n'a jamais été
 * qualifiée.
 *
 * Les étapes closes restent écartées : réclamer une action sur une affaire
 * perdue n'a pas de sens.
 */
export function sansProchaineAction({
  deals,
  estOuverte,
  aUneProchaineAction,
  exclure,
}: {
  deals: DealRecord[];
  estOuverte: (deal: DealRecord) => boolean;
  aUneProchaineAction: (deal: DealRecord) => boolean;
  /** L'affaire déjà nommée ailleurs, à ne pas compter deux fois. */
  exclure?: Identifier | null;
}): DealRecord[] {
  return deals.filter((deal) => {
    if (exclure != null && deal.id === exclure) return false;
    if (!estOuverte(deal)) return false;
    return !aUneProchaineAction(deal);
  });
}
