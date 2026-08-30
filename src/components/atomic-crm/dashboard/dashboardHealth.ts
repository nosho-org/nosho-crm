import type { DealRecord } from "../deals/cockpit/dealFields";
import {
  getDealActivity,
  getDealNextAction,
  isOpenStage,
} from "../deals/cockpit/dealFields";
import type { NextActionOptions } from "../deals/cockpit/dealFields";
import type { DealFilterState } from "../deals/dealFilterContract";
import { HEALTH_FILTERS } from "../deals/dealFilterContract";

/**
 * ---------------------------------------------------------------------------
 * Pipeline health (NOS-955 §5 and §6)
 * ---------------------------------------------------------------------------
 * "Ce bandeau n'est pas un nouveau dashboard de KPI. Il doit uniquement
 * signaler les anomalies qui nécessitent une action commerciale."
 *
 * Four rules, each producing a count, an ARR figure and the filter that opens
 * the matching list. The filter comes from `dealFilterContract`, so the number
 * shown and the list the "Voir" button opens describe the same selection.
 *
 * Every rule looks at **open deals only**. A won or lost opportunity with no
 * next action is finished, not neglected.
 *
 * ⚠️ Known imprecision on the dormancy rule. The count is computed here in whole
 * days (`daysSince(last_activity_at) > threshold`), while the list applies
 * `last_activity_at@lt <date>` in the database, comparing a timestamp against a
 * date. A deal whose last activity falls on the threshold day itself lands on
 * one side or the other depending on the time of day, so the two can differ by
 * a deal or two around the boundary. Closing the gap means either bucketing the
 * column to a date in `deals_summary` or filtering on a computed day count —
 * both worth doing, neither worth blocking the redesign for. The stage filter
 * is not a source of divergence: the list carries no stage constraint, so it can
 * only ever be the more inclusive of the two.
 */

export type HealthSeverity =
  /** Already late: the action was due and nobody did it. */
  | "critical"
  /** Drifting: no activity for longer than the configured threshold. */
  | "attention"
  /** Missing data rather than missing work. */
  | "anomaly";

export type HealthAlertId =
  | "overdue-action"
  | "dormant"
  | "missing-next-action"
  | "missing-closing-date";

export interface HealthAlert {
  id: HealthAlertId;
  severity: HealthSeverity;
  /** "12 prochaines actions en retard" */
  title: string;
  /** The trigger, spelled out: "Date dépassée et action non terminée". */
  criterion: string;
  count: number;
  /** Summed ARR of the deals concerned. */
  amount: number;
  /** Feeds `toDealsLink` so the CTA lands on exactly these deals. */
  filter: DealFilterState;
}

export interface HealthOptions {
  pipelineStatuses: string[];
  /** Days without activity before an open deal counts as dormant. */
  inactivityThresholdDays: number;
  nextActionOptions: NextActionOptions;
  today: Date;
  /**
   * How many alerts the banner shows. The spec text says three; the mockup's
   * own annotation says "maximum 3 à 5". Three by default, most severe first.
   */
  maxAlerts?: number;
}

/** Severity order, worst first. Ties keep the declaration order below. */
const SEVERITY_RANK: Record<HealthSeverity, number> = {
  critical: 0,
  attention: 1,
  anomaly: 2,
};

const plural = (count: number, one: string, many: string): string =>
  count === 1 ? one : many;

/**
 * Evaluate the four rules over the current dashboard selection.
 *
 * Returns every alert that has at least one deal, sorted by severity. Alerts
 * with no deal are dropped: an empty alert is not information, and the banner
 * shows "Aucun point d'attention" when nothing comes back.
 */
export function computeHealthAlerts(
  deals: DealRecord[],
  options: HealthOptions,
): HealthAlert[] {
  const {
    pipelineStatuses,
    inactivityThresholdDays,
    nextActionOptions,
    today,
    maxAlerts = 3,
  } = options;

  const open = deals.filter((deal) =>
    isOpenStage(deal.stage, pipelineStatuses),
  );

  const dormant: DealRecord[] = [];
  const overdue: DealRecord[] = [];
  const missingNextAction: DealRecord[] = [];
  const missingClosingDate: DealRecord[] = [];

  for (const deal of open) {
    const { isStale } = getDealActivity(deal, {
      pipelineStatuses,
      thresholdDays: inactivityThresholdDays,
      today,
    });
    if (isStale) dormant.push(deal);

    const action = getDealNextAction(deal, nextActionOptions);
    if (action.status === "overdue") overdue.push(deal);
    // "prochaine action = vide OU date prochaine action = vide" — an action
    // with no date is as unactionable as no action at all. `not-expected` is
    // excluded: early stages are exempt by configuration, not neglected.
    if (action.status === "missing" || action.status === "undated") {
      missingNextAction.push(deal);
    }

    if (!deal.expected_closing_date) missingClosingDate.push(deal);
  }

  /*
   * Les etapes REELLEMENT comptees, relevees sur les opportunites retenues.
   *
   * C'est ce qui empeche le lien « Voir » de diverger du chiffre affiche a
   * cote : il est construit a partir des memes lignes. Auparavant
   * « 4 opportunites sans prochaine action » ouvrait une liste de 15, leads
   * et affaires closes compris.
   *
   * Deduire les etapes plutot que les declarer evite d'avoir a reproduire
   * ici la regle de `getDealNextAction` -- et de la voir rediverger au
   * prochain changement de configuration.
   */
  const stagesOf = (list: DealRecord[]): string[] => [
    ...new Set(list.map((deal) => deal.stage).filter(Boolean)),
  ];

  const sumArr = (list: DealRecord[]): number =>
    list.reduce((total, deal) => total + (deal.amount ?? 0), 0);

  const candidates: HealthAlert[] = [
    {
      id: "overdue-action",
      severity: "critical",
      title: `${overdue.length} ${plural(overdue.length, "prochaine action en retard", "prochaines actions en retard")}`,
      criterion: "Date dépassée et action non terminée",
      count: overdue.length,
      amount: sumArr(overdue),
      filter: HEALTH_FILTERS.overdueAction(stagesOf(overdue)),
    },
    {
      id: "dormant",
      severity: "attention",
      title: `${dormant.length} ${plural(dormant.length, "opportunité en sommeil", "opportunités en sommeil")}`,
      criterion: `Aucune activité depuis plus de ${inactivityThresholdDays} jours`,
      count: dormant.length,
      amount: sumArr(dormant),
      filter: HEALTH_FILTERS.dormant(inactivityThresholdDays, stagesOf(dormant)),
    },
    {
      id: "missing-next-action",
      severity: "anomaly",
      title: `${missingNextAction.length} ${plural(missingNextAction.length, "opportunité sans prochaine action", "opportunités sans prochaine action")}`,
      criterion: "Prochaine action ou date manquante",
      count: missingNextAction.length,
      amount: sumArr(missingNextAction),
      filter: HEALTH_FILTERS.missingNextAction(stagesOf(missingNextAction)),
    },
    {
      id: "missing-closing-date",
      severity: "anomaly",
      title: `${missingClosingDate.length} ${plural(missingClosingDate.length, "opportunité sans date de clôture", "opportunités sans date de clôture")}`,
      criterion: "Date de clôture prévue manquante",
      count: missingClosingDate.length,
      amount: sumArr(missingClosingDate),
      filter: HEALTH_FILTERS.missingClosingDate(stagesOf(missingClosingDate)),
    },
  ];

  return candidates
    .filter((alert) => alert.count > 0)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, maxAlerts);
}

/**
 * How many alerts were found in total, before the display cap.
 *
 * The banner needs it for the "Voir tous les points d'attention" affordance:
 * capping silently would read as "there are only three problems".
 */
export function countHealthAlerts(
  deals: DealRecord[],
  options: HealthOptions,
): number {
  return computeHealthAlerts(deals, { ...options, maxAlerts: 4 }).length;
}
