import { useState } from "react";
import { Check, Pencil, Plus } from "lucide-react";
import { useNotify, useRecordContext, useUpdate } from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
 * Prochaine action (issue #114, NOS-1038)
 * ---------------------------------------------------------------------------
 * Le bloc s'était appelé "Prochaine tâche" le temps de #114, pour dire
 * honnêtement ce qu'il manipulait. NOS-1038 lui rend le vocabulaire commercial
 * demandé par la spec : ce que le commercial appelle une action, le CRM le
 * stocke dans `tasks`. Le libellé change, la ressource non.
 * Deliberately the first block after the header: an open opportunity should
 * always have a next step.
 *
 * The step is a `tasks` row, not the `deals.next_action*` columns. Those three
 * columns need someone to type into them and nobody ever has — 0 of 232
 * opportunities carried one in production, while 100 pending tasks existed. The
 * previous version pointed its CTA at the edit dialog, which does not even have
 * those fields, so the button could not do what it promised.
 *
 * Holding the real row is also what makes "Marquer comme fait" work. It used to
 * create a *second*, already-completed task and clear the empty `next_action*`
 * fields, leaving the original pending — the block redrew unchanged and the
 * button looked broken. Now it completes the task it is showing.
 */

export const DealNextTaskBlock = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, dealPipelineStatuses, dealNextActionFromStage } =
    useConfigurationContext();
  const [update] = useUpdate();
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const { nextTask, refresh } = useDealTasks(record);

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

  const sheets = (
    <>
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
    </>
  );

  const header = (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Prochaine action
    </span>
  );

  if (!nextTask) {
    // A typed `next_action` with no task behind it. Unreachable through the UI
    // and absent from production, but an import could carry one, and showing
    // "aucune" over a value someone recorded would quietly lose it.
    const legacy = !action.fromTask && action.label ? action.label : null;

    // Close Won, Lost, Churn, À reclasser : la spec demande qu'aucune action ne
    // soit réclamée. Le texte le disait déjà, mais le bouton restait offert —
    // il invitait à créer une action sur une opportunité fermée. Reste
    // accessible si une valeur héritée est affichée : il faut pouvoir la
    // remplacer par une vraie tâche.
    const expected = action.status !== "not-expected";

    return (
      <Card className="p-4 flex flex-col gap-2">
        {header}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            {legacy ?? (expected ? "À définir" : "Pas encore requise à cette étape.")}
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
        {sheets}
      </Card>
    );
  }

  return (
    <Card className="p-4 flex flex-col gap-2">
      {header}
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
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5" aria-hidden />
            Modifier l'action
          </Button>
        </div>
      </div>
      {sheets}
    </Card>
  );
};
