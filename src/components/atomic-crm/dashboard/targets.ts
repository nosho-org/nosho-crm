import type { Deal, Target } from "../types";

/**
 * ---------------------------------------------------------------------------
 * Où en est-on de l'objectif (NOS-1173)
 * ---------------------------------------------------------------------------
 * L'audit du 29 août 2026 : « 912 k€ de pipeline, mais contre quel objectif ?
 * Un chiffre sans référentiel n'est pas un instrument de pilotage, c'est une
 * décoration. »
 *
 * Ce module fait le rapprochement. Il est isolé et testé parce qu'un objectif
 * mal compté ne se voit pas : il affiche un pourcentage plausible, et c'est ce
 * pourcentage qui décide de la pression qu'un commercial se met.
 */

/** Ce qu'un objectif compte. Le CRM porte les deux sur chaque opportunité. */
export type TargetMetric = "mrr" | "arr";

export const TARGET_METRIC_LABELS: Record<TargetMetric, string> = {
  mrr: "MRR",
  arr: "ARR",
};

export interface TargetProgress {
  target: Target;
  /** Signé sur la période, dans la métrique de l'objectif. */
  achieved: number;
  /** Ce qui reste, jamais négatif : un objectif dépassé ne « reste » pas. */
  remaining: number;
  /** 0 à 1, non borné en haut — dépasser doit se voir. */
  ratio: number;
  /** Jours restants, bornes incluses. Négatif après la fin. */
  daysLeft: number;
  /** La période est-elle terminée ? */
  isOver: boolean;
}

const DAY = 86_400_000;

function toUTC(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

/**
 * Un deal compte-t-il dans cet objectif ?
 *
 * Trois conditions, et la troisième est celle qu'on oublie :
 *
 * 1. il est **signé** — `closed-won` ;
 * 2. sa date de signature tombe dans la période, bornes incluses ;
 * 3. il appartient au **titulaire** de l'objectif. Un objectif d'équipe
 *    (`sales_id` nul) prend tout le monde ; un objectif personnel ne prend que
 *    les affaires de la personne.
 *
 * Un deal sans `won_at` ne compte pas, même marqué gagné. C'est un choix : le
 * rattacher à `updated_at` ferait basculer d'un trimestre à l'autre des
 * affaires anciennes dès qu'on corrige une faute de frappe dessus.
 */
export function countsTowardTarget(deal: Deal, target: Target): boolean {
  if (deal.stage !== "closed-won") return false;
  if (!deal.won_at) return false;

  const won = toUTC(deal.won_at);
  if (Number.isNaN(won)) return false;
  if (won < toUTC(target.period_start) || won > toUTC(target.period_end)) {
    return false;
  }

  if (target.sales_id == null) return true;
  return String(deal.sales_id) === String(target.sales_id);
}

/**
 * Le montant d'un deal dans la métrique demandée.
 *
 * `amount` porte l'ARR, `mrr` le mensuel. Le MRR est dérivé de l'ARR quand il
 * n'est pas renseigné, comme le fait déjà la fiche opportunité — sans quoi un
 * objectif en MRR compterait zéro sur les affaires où seule l'ARR a été saisie,
 * ce qui est le cas le plus fréquent.
 */
export function dealValue(deal: Deal, metric: TargetMetric): number {
  if (metric === "arr") return deal.amount ?? 0;
  if (typeof deal.mrr === "number") return deal.mrr;
  return deal.amount != null ? deal.amount / 12 : 0;
}

/**
 * L'avancement d'un objectif, d'après les affaires signées qu'on lui rapporte.
 *
 * `now` est un paramètre et non `new Date()` : le décompte des jours restants
 * doit être testable, et un module qui lit l'horloge se teste mal.
 */
export function computeTargetProgress(
  target: Target,
  deals: Deal[],
  now: Date = new Date(),
): TargetProgress {
  const metric = (target.metric ?? "mrr") as TargetMetric;

  const achieved = deals
    .filter((deal) => countsTowardTarget(deal, target))
    .reduce((sum, deal) => sum + dealValue(deal, metric), 0);

  const amount = Number(target.amount) || 0;

  // Bornes incluses : le dernier jour de la période est un jour où l'on peut
  // encore signer. Le compte est donc `fin - aujourd'hui + 1`.
  const today = toUTC(now.toISOString());
  const daysLeft = Math.round((toUTC(target.period_end) - today) / DAY) + 1;

  return {
    target,
    achieved,
    // Un objectif dépassé ne « reste » pas : afficher un manque négatif
    // ferait lire « il manque -3 000 € ».
    remaining: Math.max(0, amount - achieved),
    ratio: amount > 0 ? achieved / amount : 0,
    daysLeft,
    isOver: daysLeft <= 0,
  };
}

/**
 * L'objectif d'une personne, ou celui de l'équipe.
 *
 * Prend le premier qui couvre `now`. Les index uniques de la table garantissent
 * qu'il n'y en a qu'un par personne, métrique et période — mais deux périodes
 * différentes peuvent se chevaucher, et alors c'est la plus courte qui gagne :
 * un objectif trimestriel est plus actionnable qu'un objectif annuel qui
 * l'englobe.
 */
export function findActiveTarget(
  targets: Target[],
  salesId: number | string | null,
  now: Date = new Date(),
): Target | null {
  const today = toUTC(now.toISOString());

  const candidates = targets.filter((target) => {
    const matchesOwner =
      salesId == null
        ? target.sales_id == null
        : String(target.sales_id) === String(salesId);
    return (
      matchesOwner &&
      toUTC(target.period_start) <= today &&
      toUTC(target.period_end) >= today
    );
  });

  if (!candidates.length) return null;

  return candidates.sort(
    (a, b) =>
      toUTC(a.period_end) -
      toUTC(a.period_start) -
      (toUTC(b.period_end) - toUTC(b.period_start)),
  )[0];
}

/** « 1er janvier → 31 décembre 2026 » réduit à ce qui tient dans une carte. */
export function formatTargetPeriod(target: Target): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
  return `${fmt.format(new Date(`${target.period_start}T12:00:00Z`))} → ${fmt.format(
    new Date(`${target.period_end}T12:00:00Z`),
  )}`;
}
