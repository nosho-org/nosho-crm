import type { Deal } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Les nouveaux leads du mois, et la tendance (NOS-1171)
 * ---------------------------------------------------------------------------
 * Le seul indicateur du bandeau qui mesure une **entrée** et non un stock. Les
 * six autres disent ce que le pipeline contient ; celui-ci dit ce qu'on y met.
 * Un pipeline qui ne se remplit plus se voit ici des semaines avant de se voir
 * ailleurs.
 *
 * ## Il ne suit PAS la période du tableau de bord
 *
 * « Par rapport au mois passé » désigne deux mois calendaires, et cette
 * comparaison n'a de sens que contre elle-même. Appliquer par-dessus le filtre
 * de période donnerait « le mois en cours, dans les 90 derniers jours » — une
 * phrase qui ne veut rien dire, et un chiffre qui changerait en déplaçant un
 * curseur qui n'a rien à voir.
 *
 * ## `entered_at` et non `created_at`
 *
 * La date d'entrée en pipeline est celle que le commercial saisit ; la date de
 * création est celle où la fiche a été tapée. Elles diffèrent à chaque reprise
 * d'historique, et c'est la première qui décrit l'activité commerciale. Repli
 * sur `created_at` quand elle manque — une opportunité sans date d'entrée est
 * bien entrée quelque part.
 */

export interface NewLeadsTrend {
  /** Leads entrés depuis le 1er du mois en cours. */
  current: number;
  /** Leads entrés sur le mois calendaire précédent, en entier. */
  previous: number;
  /**
   * Variation en pourcentage, ou `null` quand elle n'a pas de sens.
   *
   * `null` quand le mois précédent est à zéro : passer de 0 à 5 n'est pas
   * « +500 % », c'est un départ. Écrire un pourcentage là serait une division
   * par zéro habillée.
   */
  deltaPercent: number | null;
  /**
   * Le mois en cours est-il incomplet ?
   *
   * Toujours vrai sauf le dernier jour. C'est ce qui rend la comparaison
   * boiteuse le 2 du mois — l'interface doit le dire plutôt que d'annoncer
   * « −93 % ».
   */
  isPartialMonth: boolean;
  /** Part du mois écoulée, 0 à 1. Sert à annoncer la comparaison honnêtement. */
  monthProgress: number;
}

const dayOf = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** La date qui compte pour l'entrée en pipeline. */
export function leadDate(deal: Deal): Date | null {
  return dayOf(deal.entered_at) ?? dayOf(deal.created_at);
}

export function computeNewLeadsTrend(
  deals: Deal[],
  now: Date = new Date(),
): NewLeadsTrend {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const inMonth = (date: Date, y: number, m: number) =>
    date.getUTCFullYear() === y && date.getUTCMonth() === m;

  // Décembre → novembre de l'année précédente. `Date.UTC` gère le report ;
  // décrémenter le mois à la main donnerait le mois −1 en janvier.
  const previousMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const previousYear = previousMonthDate.getUTCFullYear();
  const previousMonth = previousMonthDate.getUTCMonth();

  let current = 0;
  let previous = 0;

  for (const deal of deals) {
    const date = leadDate(deal);
    if (!date) continue;
    if (inMonth(date, year, month)) current += 1;
    else if (inMonth(date, previousYear, previousMonth)) previous += 1;
  }

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return {
    current,
    previous,
    deltaPercent:
      previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
    isPartialMonth: now.getUTCDate() < daysInMonth,
    monthProgress: now.getUTCDate() / daysInMonth,
  };
}

/**
 * La phrase qui accompagne le chiffre.
 *
 * Elle dit la variation, et dit aussi ce qu'elle vaut. Comparer un mois entamé
 * au tiers à un mois complet donne mécaniquement une baisse : l'annoncer sans
 * la qualifier ferait conclure à un effondrement tous les 2 du mois.
 */
export function describeLeadsTrend(trend: NewLeadsTrend): string {
  if (trend.previous === 0) {
    return trend.current > 0
      ? "aucun le mois dernier"
      : "aucun ce mois-ci ni le mois dernier";
  }

  const delta = trend.deltaPercent ?? 0;
  const sign = delta > 0 ? "+" : "";
  const base = `${sign}${delta} % vs mois dernier (${trend.previous})`;

  // Sous la moitié du mois, la comparaison est trop boiteuse pour être lue
  // seule. Au-delà, elle commence à vouloir dire quelque chose.
  return trend.isPartialMonth && trend.monthProgress < 0.5
    ? `${base} — mois en cours`
    : base;
}
