import type { DealRecord } from "../deals/cockpit/dealFields";
import {
  getDealActivity,
  getDealNextAction,
  isOpenStage,
} from "../deals/cockpit/dealFields";
import type { NextActionOptions } from "../deals/cockpit/dealFields";
import type { WeightingConfig } from "../deals/cockpit/dealWeighting";
import { getDealProbability } from "../deals/cockpit/dealWeighting";

/**
 * ---------------------------------------------------------------------------
 * Qu'est-ce que je fais maintenant (NOS-1167)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « Un rappel à 3 k€ et une relance CHU à 50 k€ ont
 * exactement la même apparence. Le tri se fait donc dans la tête du
 * commercial, tous les matins, sans support. »
 *
 * Ce module fait ce tri. Il est isolé et testé parce qu'un classement est une
 * opinion : s'il est faux, il l'est silencieusement, et le commercial passe sa
 * journée sur la mauvaise affaire sans jamais savoir pourquoi elle était en
 * tête.
 *
 * ## Le score est relatif, et c'est délibéré
 *
 * Il vaut 100 pour la meilleure affaire du lot, et le reste en proportion. Un
 * score absolu supposerait une échelle — 100 points, c'est combien d'euros ? —
 * qu'aucune donnée ne fixe. « 94 » veut donc dire « 94 % du poids de la
 * première », ce qui est une phrase vraie.
 *
 * ## Et il est contestable, ce qui compte plus que d'être juste
 *
 * `explain()` rend les composantes en clair — « 50 k€ × 40 % · 21 j sans
 * contact » — pour qu'un commercial puisse voir *pourquoi* une affaire est en
 * tête et dire qu'il n'est pas d'accord. Un tri opaque n'est jamais adopté : on
 * le contourne, et l'écran redevient une liste qu'on relit à la main.
 */

/** Plafonds des deux composantes d'urgence, en jours. */
const STALENESS_CAP = 60;
const OVERDUE_CAP = 30;

/**
 * Ce que vaut une prochaine action absente, en multiplicateur.
 *
 * Une demi-unité, soit l'équivalent de 30 jours sans contact. C'est délibéré :
 * une affaire sans prochaine action n'est pas urgente en soi, elle est
 * *invisible* — rien ne la fera remonter un autre jour. L'audit compte
 * 4 opportunités dans ce cas pour 74 k€.
 */
const MISSING_ACTION_WEIGHT = 0.5;

export interface FocusCandidate {
  deal: DealRecord;
  /** 0 à 100, relatif à la meilleure affaire du lot. */
  score: number;
  /** Le produit brut, avant normalisation. Exposé pour les tests. */
  raw: number;
  /** ARR × probabilité. `null` quand la probabilité est inconnue. */
  weightedAmount: number;
  probability: number | null;
  daysSinceActivity: number | null;
  /** Jours de retard de la prochaine action, `null` si elle n'est pas échue. */
  daysOverdue: number | null;
  hasNextAction: boolean;
}

export interface FocusOptions extends WeightingConfig, NextActionOptions {
  inactivityThresholdDays: number;
}

/**
 * Le multiplicateur d'urgence, entre 1 et 3,5.
 *
 * Trois causes de remontée, additives et plafonnées :
 *
 * - le temps écoulé depuis le dernier contact, plafonné à 60 jours — au-delà,
 *   une affaire n'est pas « deux fois plus morte » ;
 * - le retard de la prochaine action, plafonné à 30 jours ;
 * - l'absence de prochaine action.
 *
 * Additives et non multiplicatives : une affaire qui cumule les trois doit
 * remonter, pas exploser. Multiplier aurait donné à une seule affaire un score
 * écrasant les autres, et une file d'actions où tout est écrasé par la
 * première ne se lit pas mieux qu'une file non triée.
 */
export function urgencyMultiplier({
  daysSinceActivity,
  daysOverdue,
  hasNextAction,
}: {
  daysSinceActivity: number | null;
  daysOverdue: number | null;
  hasNextAction: boolean;
}): number {
  const staleness =
    daysSinceActivity != null
      ? Math.min(Math.max(daysSinceActivity, 0), STALENESS_CAP) / STALENESS_CAP
      : 0;
  const overdue =
    daysOverdue != null
      ? Math.min(Math.max(daysOverdue, 0), OVERDUE_CAP) / OVERDUE_CAP
      : 0;
  const missing = hasNextAction ? 0 : MISSING_ACTION_WEIGHT;

  return 1 + staleness + overdue + missing;
}

/**
 * Classe les affaires ouvertes par ce qu'il y a à gagner à s'en occuper
 * aujourd'hui.
 *
 * Ne prend que les affaires **ouvertes** : une affaire close n'a plus rien à
 * faire avancer, et une affaire perdue remonterait très haut sur l'ancienneté
 * de son dernier contact — exactement le mauvais conseil.
 *
 * Une affaire sans probabilité connue est écartée, pas comptée à zéro : la
 * pondérer arbitrairement mettrait un chiffre inventé en tête d'un écran dont
 * tout l'intérêt est d'être discutable.
 */
export function rankDealsByFocus(
  deals: DealRecord[],
  options: FocusOptions,
): FocusCandidate[] {
  const { inactivityThresholdDays, today } = options;

  const candidates = deals
    .filter((deal) => isOpenStage(deal.stage, options.pipelineStatuses))
    .map((deal): FocusCandidate | null => {
      const { value: probability } = getDealProbability(deal, options);
      if (probability === null) return null;

      const weightedAmount = (deal.amount ?? 0) * probability;
      if (weightedAmount <= 0) return null;

      const { daysSinceActivity } = getDealActivity(deal, {
        pipelineStatuses: options.pipelineStatuses,
        thresholdDays: inactivityThresholdDays,
        today,
      });

      const action = getDealNextAction(deal, options);
      const hasNextAction = action.status !== "missing";
      // `daysUntil` est négatif quand l'action est en retard. On lit ce champ
      // plutôt que de recalculer depuis la date : deux calculs du même retard
      // finissent toujours par diverger d'un jour.
      const daysOverdue =
        action.daysUntil != null && action.daysUntil < 0
          ? -action.daysUntil
          : null;

      const raw =
        weightedAmount *
        urgencyMultiplier({ daysSinceActivity, daysOverdue, hasNextAction });

      return {
        deal,
        score: 0,
        raw,
        weightedAmount,
        probability,
        daysSinceActivity,
        daysOverdue,
        hasNextAction,
      };
    })
    .filter((candidate): candidate is FocusCandidate => candidate !== null)
    .sort((a, b) => b.raw - a.raw);

  const best = candidates[0]?.raw ?? 0;
  if (best <= 0) return [];

  return candidates.map((candidate) => ({
    ...candidate,
    score: Math.round((candidate.raw / best) * 100),
  }));
}

/**
 * Le score en toutes lettres, pour que le commercial puisse le contester.
 *
 * Une seule ligne, dans l'ordre du calcul : ce qui est en jeu, puis ce qui
 * rend l'affaire urgente. Chaque composante n'apparaît que si elle a
 * réellement joué — écrire « 0 j sans contact » sur une affaire touchée ce
 * matin ferait douter du reste.
 */
export function explainFocus(
  candidate: FocusCandidate,
  formatAmount: (value: number) => string,
): string {
  const parts = [
    `${formatAmount(candidate.deal.amount ?? 0)} × ${Math.round(
      (candidate.probability ?? 0) * 100,
    )} %`,
  ];

  if (candidate.daysSinceActivity != null && candidate.daysSinceActivity > 0) {
    parts.push(`${candidate.daysSinceActivity} j sans contact`);
  }
  if (candidate.daysOverdue != null && candidate.daysOverdue > 0) {
    parts.push(`action échue depuis ${candidate.daysOverdue} j`);
  }
  if (!candidate.hasNextAction) {
    parts.push("aucune prochaine action");
  }

  return parts.join(" · ");
}
