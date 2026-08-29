import { useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { useNotify, useRecordContext, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Task } from "../../tasks/Task";
import { TaskCreateSheet } from "../../tasks/TaskCreateSheet";
import { TaskEditSheet } from "../../tasks/TaskEditSheet";
import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Deal } from "../../types";
import { getDealNextAction } from "../cockpit/dealFields";
import { startOfToday } from "../cockpit/dealDates";
import { DealOwner } from "../cockpit/DealFieldBadges";
import { TaskDueDate } from "../shared/DealBadges";
import { useDealTasks } from "./useDealTasks";

/**
 * ---------------------------------------------------------------------------
 * Prochaine action et tâches, en un seul bloc (issue #114, NOS-1038, NOS-1164)
 * ---------------------------------------------------------------------------
 * Deux cartes se suivaient, et la première répétait mot pour mot la première
 * ligne de la seconde : `nextTask` **est** `tasks[0]`, littéralement. Le
 * lecteur y voyait deux fois la même échéance et devait deviner que « Marquer
 * comme fait » en haut et la case à cocher en bas agissaient sur la même
 * tâche.
 *
 * Une seule carte, donc : l'échéance la plus proche mise en avant avec ses deux
 * actions, les autres listées dessous. Une tâche n'apparaît qu'une fois.
 *
 * ## Ce qui n'a pas changé, et ne doit pas
 *
 * L'action est une ligne de `tasks`, pas les colonnes `deals.next_action*`.
 * Celles-ci attendent qu'on y saisisse quelque chose et personne ne l'a jamais
 * fait — 0 opportunité sur 232 en portait une en production, pour 100 tâches en
 * cours. La version d'origine pointait son bouton vers la fenêtre d'édition,
 * qui n'a même pas ces champs.
 *
 * Tenir la vraie ligne est aussi ce qui fait marcher « Marquer comme fait ». Le
 * bouton créait autrefois une *seconde* tâche déjà terminée et vidait les
 * colonnes `next_action*` (déjà vides), laissant l'originale en cours : le bloc
 * se redessinait à l'identique et le bouton semblait mort.
 *
 * `AddTask` n'est délibérément pas réutilisé pour le CTA : il lit son contact
 * dans `useRecordContext()`, qui porte ici un `Deal` — il écrirait l'identifiant
 * de l'opportunité dans `tasks.contact_id`.
 */

export const DealTasksBlock = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, dealPipelineStatuses, dealNextActionFromStage } =
    useConfigurationContext();
  const [update] = useUpdate();
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const { tasks, nextTask, isPending, refresh } = useDealTasks(record);

  if (!record) return null;

  const action = getDealNextAction(record, {
    dealStages,
    pipelineStatuses: dealPipelineStatuses,
    fromStage: dealNextActionFromStage,
    today: startOfToday(),
  });

  const markDone = async () => {
    if (!nextTask) return;
    setPending(true);
    try {
      await update(
        "tasks",
        {
          id: nextTask.task.id,
          data: {
            done_date: new Date().toISOString(),
            // Backfill the direct link while we hold the row: the task was
            // reachable only through a contact, and pinning it to the deal is
            // what keeps it in this opportunity's history if the contact is
            // later detached.
            deal_id: record.id,
          },
          previousData: nextTask.task,
        },
        { returnPromise: true },
      );
      notify("Tâche terminée — elle apparaît dans l'activité", {
        type: "info",
      });
      refresh();
    } catch {
      notify("La tâche n'a pas pu être marquée comme faite", { type: "error" });
    } finally {
      setPending(false);
    }
  };

  const contactIds = (record.contact_ids ?? []) as number[];

  // `nextTask` est `tasks[0]` : les suivantes sont le reste, sans quoi la
  // première s'afficherait deux fois — le défaut que cette fusion corrige.
  const others = tasks.slice(1);

  /*
   * Close Won, Lost, Churn : la spec demande qu'aucune action ne soit réclamée
   * sur une opportunité fermée. Le texte le disait déjà, mais le bouton restait
   * offert — il invitait à définir une action sur un dossier clos.
   */
  const expected = action.status !== "not-expected";

  /*
   * Un `next_action` saisi sans tâche derrière. Inatteignable par l'interface
   * et absent de la production, mais un import pourrait en porter un, et
   * afficher « aucune » par-dessus une valeur que quelqu'un a enregistrée la
   * perdrait en silence.
   */
  const legacy = !action.fromTask && action.label ? action.label : null;

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Prochaine action
        </span>
        {(expected || tasks.length > 0) && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" aria-hidden />
            Ajouter une tâche
          </Button>
        )}
      </div>

      {nextTask ? (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">{nextTask.task.text}</p>
            <p className="flex items-center gap-2 flex-wrap mt-1 text-sm">
              <TaskDueDate
                dueDate={nextTask.task.due_date}
                status={nextTask.status}
                className="text-sm"
              />
              <span className="text-muted-foreground">·</span>
              <DealOwner
                ownerId={nextTask.task.sales_id ?? record.sales_id ?? null}
                title="Responsable de l'action"
              />
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={markDone} disabled={pending}>
              <Check className="w-3.5 h-3.5" aria-hidden />
              {pending ? "…" : "Marquer comme fait"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Modifier l'action
            </Button>
          </div>
        </div>
      ) : isPending ? null : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            {legacy ??
              (expected
                ? "Aucune tâche en cours sur cette opportunité."
                : "Pas encore requise à cette étape.")}
          </span>
          {(expected || legacy) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreating(true)}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Définir l'action
            </Button>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {/* Le compte évite d'ouvrir la carte pour savoir ce qu'elle cache
                quand elle en porte beaucoup. */}
            Ensuite ({others.length})
          </span>
          <div className="space-y-2">
            {others.map(({ task }) => (
              <Task key={task.id} task={task} showContact showTime={false} />
            ))}
          </div>
        </div>
      )}

      <TaskCreateSheet
        open={creating}
        onOpenChange={setCreating}
        deal_id={record.id}
        dealContactIds={contactIds}
        dealName={record.name}
        onCreated={refresh}
      />
      {nextTask && (
        <TaskEditSheet
          open={editing}
          onOpenChange={(open) => {
            setEditing(open);
            if (!open) refresh();
          }}
          taskId={nextTask.task.id}
        />
      )}
    </Card>
  );
};
