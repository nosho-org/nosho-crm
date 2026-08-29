import { Link } from "react-router-dom";
import { useGetIdentity, useGetList } from "ra-core";
import { Card } from "@/components/ui/card";

import { Task } from "../tasks/Task";
import { useConfigurationContext } from "../root/ConfigurationContext";
import { formatCurrencyCompact } from "../misc/formatCurrency";
import type { Deal, Task as TaskRecord } from "../types";
import { AnimatedListItem } from "@/components/ui/motion";
import { useDashboard } from "./DashboardContext";
import {
  BUCKET_LABELS,
  type QueueBucket,
  buildQueue,
  summarizeBucket,
} from "./actionQueue";

/**
 * ---------------------------------------------------------------------------
 * La file d'actions (NOS-1174)
 * ---------------------------------------------------------------------------
 * Remplace « Tâches à venir », qui listait sans hiérarchie et coiffait des
 * tâches déjà échues d'un en-tête « PLUS TARD ».
 *
 * Trois groupes dans l'ordre où on les traite, chaque en-tête portant ce que
 * son groupe pèse : « En retard — 2 · 30 k€ en jeu ». C'est ce chiffre qui
 * fait la différence entre une liste et un ordre du jour.
 *
 * ## `<Task>` est réutilisé, volontairement
 *
 * Une tâche se coche, se reporte, se modifie et se supprime de la même façon
 * ici, sur une fiche contact et sur une opportunité. Réécrire la ligne pour le
 * cockpit aurait donné une quatrième copie de ces quatre gestes — et c'est la
 * copie qu'on oublie de corriger.
 *
 * Le montant en jeu est donc posé **à côté** de la ligne plutôt que dedans :
 * c'est du contexte de cockpit, pas une propriété de la tâche.
 */

const BUCKET_STYLES: Record<QueueBucket, string> = {
  overdue: "text-[var(--deal-status-critical)]",
  today: "text-foreground",
  week: "text-muted-foreground",
  later: "text-muted-foreground",
};

/** Les groupes affichés, dans l'ordre. « Plus tard » n'en est pas : voir plus bas. */
const SHOWN: QueueBucket[] = ["overdue", "today", "week"];

export const CockpitQueue = () => {
  const { selection, today } = useDashboard();
  const { currency } = useConfigurationContext();
  const { identity } = useGetIdentity();

  const owner = selection.salesId ?? identity?.id;

  const { data: tasks, isPending } = useGetList<TaskRecord>(
    "tasks",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "due_date", order: "ASC" },
      filter: {
        "done_date@is": null,
        // `selection.salesId` nul veut dire « tous » et n'écrit aucune clé :
        // `sales_id: null` demanderait les tâches sans responsable.
        ...(owner != null ? { sales_id: owner } : {}),
      },
    },
    { enabled: selection.salesId != null || !!identity },
  );

  /*
   * Les affaires viennent du contexte du tableau de bord, filtrées comme tout
   * le reste de l'écran. Une tâche dont l'affaire est hors périmètre garde sa
   * place dans la file — c'est son montant qui manque, pas la tâche.
   */
  const { deals } = useDashboard();

  const queue = buildQueue(tasks ?? [], deals as unknown as Deal[], today);
  const amount = (value: number) => formatCurrencyCompact(value, currency);

  if (isPending) return null;

  return (
    <Card className="p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          File d'actions
        </span>
        <Link
          to="/deals"
          className="text-xs text-muted-foreground underline hover:no-underline"
        >
          Voir les opportunités
        </Link>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune tâche en cours. Rien à faire aujourd'hui, ou rien de planifié —
          les deux ne se valent pas.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {SHOWN.map((bucket) => {
            const entries = queue.filter((entry) => entry.bucket === bucket);
            if (!entries.length) return null;
            const { count, amount: total } = summarizeBucket(entries);

            return (
              <div key={bucket} className="flex flex-col gap-1">
                <div
                  className={`text-xs font-semibold uppercase tracking-wide ${BUCKET_STYLES[bucket]}`}
                >
                  {BUCKET_LABELS[bucket]} — {count}
                  {total > 0 && ` · ${amount(total)} en jeu`}
                </div>

                <div className="flex flex-col">
                  {/* L'entrée décalée dit l'ordre du tri : le retard le plus
                      ancien d'abord, puis l'enjeu décroissant. Coupée au-delà
                      de huit lignes — voir `AnimatedListItem`. */}
                  {entries.map((entry, index) => (
                    <AnimatedListItem
                      key={entry.task.id}
                      index={index}
                      className="flex flex-col"
                    >
                      <Task task={entry.task} showContact showTime={false} />
                      {(entry.deal || entry.daysOverdue > 0) && (
                        <div className="ml-9 -mt-2 mb-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {entry.deal && (
                            <Link
                              to={`/deals/${entry.deal.id}/show`}
                              className="underline hover:no-underline"
                            >
                              {entry.deal.company_name || entry.deal.name}
                            </Link>
                          )}
                          {/* Le montant en jeu : c'est lui qui permet de
                              sauter une tâche à 3 k€ sans culpabilité. */}
                          {entry.amount != null && (
                            <span className="font-medium text-foreground">
                              {amount(entry.amount)}
                            </span>
                          )}
                          {entry.daysOverdue > 0 && (
                            <span className="text-[var(--deal-status-critical)]">
                              en retard de {entry.daysOverdue} j
                            </span>
                          )}
                        </div>
                      )}
                    </AnimatedListItem>
                  ))}
                </div>
              </div>
            );
          })}

          {/*
            « Plus tard » n'a pas de groupe, seulement un décompte.

            Le déplier ferait de la file une liste de tout ce qui existe, ce
            qu'elle remplace justement. Le compte suffit à dire qu'il reste
            quelque chose, et « Voir les opportunités » y mène.
          */}
          {queue.some((entry) => entry.bucket === "later") && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              {queue.filter((entry) => entry.bucket === "later").length}{" "}
              tâche(s) au-delà de sept jours, ou sans échéance.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};
