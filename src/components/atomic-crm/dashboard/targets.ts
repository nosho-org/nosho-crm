import type { Deal, Target } from "../types";
import { type MonthlyRevenue, currentMonthStart } from "./revenueActuals";

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

/**
 * Le regime mensuel constate, et non le cumul (NOS-1182).
 *
 * Simon : « le MRR c'est ce qui rentre chaque mois ». Il a raison, et la
 * premiere version avait tort : elle ADDITIONNAIT les mois de la periode.
 * Sur « 25 k EUR de MRR d'ici la fin de l'annee », cela affichait 20 548 EUR
 * apres sept mois -- 82 % d'un objectif dont on est en realite a 15 %.
 *
 * L'erreur n'etait pas arithmetique mais semantique : un MRR est un DEBIT,
 * pas un volume. Cumuler des debits mensuels donne un encaissement annuel,
 * qui se compare a un ARR, jamais a un MRR.
 *
 * ## Une moyenne, pas le dernier mois seul (NOS-1249)
 *
 * La premiere correction prenait le dernier mois COMPLET et le multipliait par
 * douze. Elle a bute sur un fait de Qonto : Mollie ne reverse pas « le MRR du
 * mois », il regroupe les prelevements par LOTS et les vire a sa propre
 * cadence. Juillet 2026 a recu un lot de 1 988 EUR, aout un de 1 231 EUR : le
 * total mensuel encaisse sautait de 3 874 a 2 856 sans qu'aucun client n'ait
 * bouge. Multiplier ce hasard par douze donnait un ARR qui oscillait de 46 k a
 * 34 k d'un mois sur l'autre.
 *
 * On moyenne donc les `FENETRE_MOIS` derniers mois complets : sur trois mois,
 * les lots se compensent, et le chiffre ne bouge plus que quand la base
 * d'abonnements bouge vraiment. Faute d'API Mollie (aucune cle disponible), le
 * lissage sur l'encaisse Qonto est la meilleure approximation du MRR reel.
 *
 * Le mois en cours reste ecarte : entame au tiers, il ferait lire une chute
 * tous les 10 du mois. On moyenne ce qui existe quand moins de trois mois
 * complets sont disponibles -- diviser par trois un debut d'activite qui n'a
 * que deux mois sous-estimerait le regime.
 *
 * En ARR, la moyenne est annualisee (x12) : les deux objectifs affichent alors
 * le meme pourcentage d'avancement, c'est le meme argent dans deux unites.
 */
export const FENETRE_MOIS = 3;

function runRateInPeriod(
  actuals: MonthlyRevenue[],
  target: Target,
  metric: TargetMetric,
  now: Date,
): number {
  const start = target.period_start.slice(0, 10);
  const end = target.period_end.slice(0, 10);
  const current = currentMonthStart(now);

  const complete = actuals
    .filter(
      (month) =>
        month.month >= start && month.month <= end && month.month < current,
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  const fenetre = complete.slice(-FENETRE_MOIS);
  if (fenetre.length === 0) return 0;

  const moyenne =
    fenetre.reduce((total, mois) => total + mois.amount, 0) / fenetre.length;

  return metric === "arr" ? moyenne * 12 : moyenne;
}

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
  /**
   * Encaisse reelle, quand elle est disponible (NOS-1181).
   *
   * Simon : « le montant dans objectif equipe n'est pas le meme que dans
   * encaisse ». Il avait raison de s'en etonner : deux chiffres presentes
   * comme du MRR, sur un meme ecran, qui ne concordent pas.
   *
   * Ils ne mesuraient pas la meme chose. L'objectif comptait le MRR des
   * opportunites marquees gagnees dans le CRM ; l'encaisse compte ce qui est
   * arrive en banque. La saisie et la realite.
   *
   * L'objectif d'EQUIPE se mesure desormais sur l'encaisse : « 25 k EUR de MRR
   * d'ici la fin de l'annee » parle d'argent recu, pas de cases cochees.
   *
   * Un objectif PERSONNEL ne le peut pas -- un virement bancaire ne porte pas
   * de commercial. Il reste donc mesure sur les affaires signees du CRM, et
   * l'interface le dit, faute de quoi on croirait comparer deux chiffres
   * comparables.
   */
  actuals?: MonthlyRevenue[],
): TargetProgress {
  const metric = (target.metric ?? "mrr") as TargetMetric;

  const achieved =
    actuals && target.sales_id == null
      ? runRateInPeriod(actuals, target, metric, now)
      : deals
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
