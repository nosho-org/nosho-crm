import { useGetIdentity, useGetList } from "ra-core";

import { formatCurrencyCompact } from "../misc/formatCurrency";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { DealRecord } from "../deals/cockpit/dealFields";
import { startOfToday } from "../deals/cockpit/dealDates";
import type { Task } from "../types";
import { toDealsLink } from "../deals/dealFilterContract";
import { bucketFor } from "../dashboard/actionQueue";
import { explainFocus, rankDealsByFocus } from "../dashboard/dealFocus";
import type { AppNotification } from "./notifications";

/**
 * ---------------------------------------------------------------------------
 * Les notifications, calculées pour toute l'application (NOS-1178)
 * ---------------------------------------------------------------------------
 * Ce hook a d'abord vécu dans le tableau de bord, et lisait son contexte. La
 * cloche est dans l'en-tête, donc présente sur toutes les pages : il fallait
 * qu'il sache se passer de ce contexte.
 *
 * Il fait donc ses propres requêtes. Deux conséquences assumées :
 *
 * **Il ne suit pas les filtres du tableau de bord.** C'est voulu : une
 * notification qui disparaîtrait parce qu'on a restreint une période ne
 * notifierait plus rien. Le périmètre est le pipeline ouvert, point.
 *
 * **Il tourne sur toutes les pages.** Deux requêtes, mises en cache par
 * react-query et partagées avec le reste de l'écran quand les clés coïncident.
 *
 * ## Elles sont dérivées de la donnée, pas d'événements
 *
 * Voir `notifications.ts` : c'est ce qui impose que « fermer » vaille pour la
 * journée, et que chaque message porte une signature de son contenu.
 */
export function useAppNotifications(): AppNotification[] {
  const {
    dealStages,
    dealPipelineStatuses,
    dealNextActionFromStage,
    dealStageProbabilities,
    dealInactivityAlertDays,
    currency,
  } = useConfigurationContext();
  const { identity } = useGetIdentity();

  const today = startOfToday();

  /*
   * Les affaires ouvertes, toutes responsables confondus.
   *
   * `archived_at@is: null` plutôt qu'un filtre d'étape : les étapes closes
   * sont écartées par `rankDealsByFocus`, qui connaît la configuration. Les
   * dupliquer ici en dur donnerait deux définitions de « ouverte ».
   */
  const { data: deals } = useGetList<DealRecord>("deals", {
    pagination: { page: 1, perPage: 500 },
    sort: { field: "last_activity_at", order: "ASC" },
    filter: { "archived_at@is": null },
  });

  const { data: tasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "done_date@is": null,
        ...(identity?.id != null ? { sales_id: identity.id } : {}),
      },
    },
    { enabled: !!identity },
  );

  const ranked = rankDealsByFocus(deals ?? [], {
    stageProbabilities: dealStageProbabilities ?? {},
    pipelineStatuses: dealPipelineStatuses,
    dealStages,
    fromStage: dealNextActionFromStage,
    inactivityThresholdDays: dealInactivityAlertDays,
    today,
  });

  const amount = (value: number) => formatCurrencyCompact(value, currency);
  const notifications: AppNotification[] = [];

  const top = ranked[0];
  if (top) {
    notifications.push({
      id: `focus-${top.deal.id}`,
      severity: "action",
      title: `À faire : ${top.deal.company_name || top.deal.name}`,
      body: `${amount(top.deal.amount ?? 0)} d'ARR${
        top.hasNextAction ? "" : " · aucune prochaine action"
      }`,
      detail: `score ${top.score} · ${explainFocus(top, amount)}`,
      to: `/deals/${top.deal.id}/show`,
      /*
       * La signature inclut le score arrondi à la dizaine.
       *
       * Fermer « Oxance, score 94 » ne doit pas taire la même affaire remontée
       * à 100 le lendemain, ni la faire revenir parce qu'elle est passée à 93.
       * La dizaine distingue « la situation a changé » de « le chiffre a
       * bougé ».
       */
      dismissKey: `focus-${top.deal.id}-${Math.round(top.score / 10)}`,
    });
  }

  const due = (tasks ?? []).filter((task) => {
    const { bucket } = bucketFor(task.due_date, today);
    return bucket === "overdue" || bucket === "today";
  });
  const overdue = (tasks ?? []).filter(
    (task) => bucketFor(task.due_date, today).bucket === "overdue",
  ).length;

  if (due.length > 0) {
    notifications.push({
      id: "tasks-today",
      severity: overdue > 0 ? "warning" : "info",
      title: `${due.length} action${due.length > 1 ? "s" : ""} aujourd'hui`,
      body: overdue > 0 ? `dont ${overdue} en retard` : "rien en retard",
      to: "/",
      // Fermer « 6 actions » le matin ne doit pas taire « 9 actions » deux
      // heures plus tard : ce n'est plus la même journée de travail.
      dismissKey: `tasks-today-${due.length}-${overdue}`,
    });
  }

  const missing = ranked.filter((candidate) => !candidate.hasNextAction);
  if (missing.length > 0) {
    const stake = missing.reduce(
      (sum, candidate) => sum + (candidate.deal.amount ?? 0),
      0,
    );
    notifications.push({
      id: "missing-next-action",
      severity: "warning",
      title: `${missing.length} opportunité${missing.length > 1 ? "s" : ""} sans prochaine action`,
      body: `${amount(stake)} qui n'avancent plus`,
      /*
       * Les cinq opportunites nommees, pas un lien vers la liste entiere.
       *
       * Simon : « quand je clique sur 5 opportunites j arrive sur l ensemble
       * des opportunites ». Le lien etait un `/deals` nu, sans le moindre
       * filtre (NOS-1193).
       *
       * Et redecrire le critere ne suffirait pas : ce hook compte les actions
       * ABSENTES (`status !== "missing"`), le tableau de bord les actions
       * absentes OU non datees, et le filtre de liste celles dont les deux
       * colonnes de date sont nulles. Trois definitions du meme mot. Nommer
       * les lignes est le seul lien qui ne puisse pas mentir sur son chiffre.
       */
      to: toDealsLink({ ids: missing.map((candidate) => candidate.deal.id) }),
      dismissKey: `missing-next-action-${missing.length}`,
    });
  }

  return notifications;
}
