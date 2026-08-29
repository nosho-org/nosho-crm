import { useGetIdentity, useGetList } from "ra-core";

import { NotificationStack } from "../notifications/NotificationStack";
import type { AppNotification } from "../notifications/notifications";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import { useConfigurationContext } from "../root/ConfigurationContext";
import type { Task } from "../types";
import { useDashboard } from "./DashboardContext";
import { bucketFor } from "./actionQueue";
import { explainFocus, rankDealsByFocus } from "./dealFocus";

/**
 * ---------------------------------------------------------------------------
 * Ce que le cockpit a à dire aujourd'hui (NOS-1172)
 * ---------------------------------------------------------------------------
 * Ce module ne fait que **construire** les notifications ; la pile qui les
 * affiche et gère leur fermeture est générique et vit dans
 * `notifications/`. La séparation compte : les sources vont se multiplier —
 * doublons de sociétés, contrats à relancer — et chacune doit pouvoir
 * s'ajouter sans toucher à l'affichage.
 *
 * Trois sources aujourd'hui, dans l'ordre où elles se lisent :
 *
 *   1. **l'affaire à traiter maintenant**, celle que `rankDealsByFocus`
 *      classe en tête ;
 *   2. **les actions du jour**, retard compris ;
 *   3. **les opportunités sans prochaine action**, qui n'avancent plus faute
 *      de date.
 *
 * Les deux premières remplacent la carte « À faire maintenant » et la bande
 * « Ma journée », qui prenaient chacune une pleine largeur pour une phrase.
 */
export const CockpitNotifications = () => {
  const {
    deals,
    isPending,
    inactivityThresholdDays,
    today,
    weighting,
    selection,
  } = useDashboard();
  const {
    dealStages,
    dealPipelineStatuses,
    dealNextActionFromStage,
    currency,
  } = useConfigurationContext();
  const { identity } = useGetIdentity();

  const owner = selection.salesId ?? identity?.id;

  const { data: tasks } = useGetList<Task>(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "done_date@is": null,
        ...(owner != null ? { sales_id: owner } : {}),
      },
    },
    { enabled: selection.salesId != null || !!identity },
  );

  const ranked = rankDealsByFocus(deals, {
    stageProbabilities: weighting.stageProbabilities,
    pipelineStatuses: dealPipelineStatuses,
    dealStages,
    fromStage: dealNextActionFromStage,
    inactivityThresholdDays,
    today,
  });

  if (isPending) return null;

  const amount = (value: number) => formatCurrencyCompact(value, currency);
  const notifications: AppNotification[] = [];

  const top = ranked[0];
  if (top) {
    notifications.push({
      id: `focus-${top.deal.id}`,
      severity: "action",
      title: `À faire maintenant : ${top.deal.company_name || top.deal.name}`,
      body: `${amount(top.deal.amount ?? 0)} d'ARR · ${amount(top.weightedAmount)} pondéré${
        top.hasNextAction ? "" : " · aucune prochaine action définie"
      }`,
      // Le calcul en clair, pour que le classement reste contestable.
      detail: `score ${top.score} · ${explainFocus(top, amount)}`,
      to: `/deals/${top.deal.id}/show`,
      actionLabel: "Ouvrir",
      /*
       * La signature inclut le score arrondi à la dizaine.
       *
       * Fermer « CHU de Nantes, score 94 » ne doit pas taire la même affaire
       * remontée à 100 le lendemain — mais ne doit pas non plus la faire
       * revenir parce qu'elle est passée à 93. La dizaine est le grain qui
       * distingue « la situation a changé » de « le chiffre a bougé ».
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
      title: `${due.length} action${due.length > 1 ? "s" : ""} à traiter aujourd'hui`,
      body:
        overdue > 0
          ? `dont ${overdue} en retard`
          : "rien en retard, tout est pour aujourd'hui",
      /*
       * La signature porte les deux comptes.
       *
       * Fermer « 6 actions » le matin ne doit pas taire « 9 actions » deux
       * heures plus tard : ce n'est plus la même journée de travail.
       */
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
      body: `${amount(stake)} qui n'avancent plus faute de date`,
      to: "/deals",
      actionLabel: "Voir",
      dismissKey: `missing-next-action-${missing.length}`,
    });
  }

  return <NotificationStack notifications={notifications} />;
};
