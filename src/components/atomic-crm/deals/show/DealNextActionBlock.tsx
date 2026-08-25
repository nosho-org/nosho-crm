import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Pencil } from "lucide-react";
import {
  type Identifier,
  useCreate,
  useGetIdentity,
  useGetList,
  useNotify,
  useRecordContext,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import { Task } from "../../tasks/Task";
import type { Deal, Task as TTask } from "../../types";
import { getDealNextAction } from "../cockpit/dealFields";
import { startOfToday } from "../cockpit/dealDates";
import { formatDate } from "../cockpit/dealFormat";
import { DealOwner } from "../cockpit/DealFieldBadges";
import { DealCreateTaskButton } from "./DealCreateTaskButton";
import { mergeOpenTasks } from "./dealOpenTasks";

/**
 * ---------------------------------------------------------------------------
 * Prochaine action (NOS-957 §2)
 * ---------------------------------------------------------------------------
 * "C'est volontairement le premier bloc après le header. Une opportunité
 * ouverte doit idéalement toujours avoir une prochaine action."
 *
 * Since #108 the action falls back to the opportunity's oldest open task, so
 * this block is also where its backlog belongs (#112): the timeline below shows
 * only what has already happened, and a task created from the header would
 * otherwise be invisible until someone completed it.
 *
 * Marking one done must never lose it. Two paths, because there are two kinds
 * of action:
 *
 *   * it came from a task — complete that task. Writing a second, completed row
 *     the way this did until #112 left the original open, so the action came
 *     straight back and the timeline showed it twice;
 *   * it was typed into `deals.next_action` — write it to `tasks` as a completed
 *     row, which is what makes it appear in the timeline, and only then clear
 *     the three `next_action*` fields. "Ne jamais supprimer l'action précédente."
 */

const STATUS_STYLE: Record<string, { color: string; label: string }> = {
  overdue: { color: "var(--deal-status-critical)", label: "En retard" },
  today: { color: "var(--deal-status-serious)", label: "Aujourd'hui" },
  upcoming: { color: "var(--foreground)", label: "" },
  undated: { color: "var(--deal-status-warning)", label: "Sans date" },
};

export const DealNextActionBlock = () => {
  const record = useRecordContext<Deal>();
  const { dealStages, dealPipelineStatuses, dealNextActionFromStage } =
    useConfigurationContext();
  const { identity } = useGetIdentity();
  const [update] = useUpdate();
  const [create] = useCreate();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const dealId = record?.id;
  const contactIds = (record?.contact_ids ?? []) as Identifier[];
  const backlogQuery = {
    pagination: { page: 1, perPage: 50 },
    sort: { field: "due_date", order: "ASC" as const },
  };

  // Two queries rather than one `@or`: see dealOpenTasks.ts for why the OR
  // cannot be pushed down to both providers.
  const { data: dealTasks, isPending: dealTasksPending } = useGetList<TTask>(
    "tasks",
    {
      ...backlogQuery,
      filter: { "deal_id@eq": dealId, "done_date@is": null },
    },
    { enabled: dealId != null },
  );
  const { data: contactTasks, isPending: contactTasksPending } =
    useGetList<TTask>(
      "tasks",
      {
        ...backlogQuery,
        // `contact_id@in: "()"` is not a filter; the query is off without ids.
        filter: {
          "contact_id@in": `(${contactIds.join(",")})`,
          "done_date@is": null,
        },
      },
      { enabled: contactIds.length > 0 },
    );

  if (!record) return null;

  const action = getDealNextAction(record, {
    dealStages,
    pipelineStatuses: dealPipelineStatuses,
    fromStage: dealNextActionFromStage,
    today: startOfToday(),
  });

  const openTasks = mergeOpenTasks(dealTasks, contactTasks);
  // A disabled query stays `pending` forever, hence the contact guard.
  const backlogLoading =
    dealTasksPending || (contactIds.length > 0 && contactTasksPending);

  // When the action came from the backlog it IS one of these rows, and the same
  // ordering makes it the head. Matching the label first guards against a tie
  // that the client and the view happen to break differently.
  const sourceTask = action.fromTask
    ? (openTasks.find((task) => task.text?.trim() === action.label) ??
      openTasks[0])
    : undefined;
  const otherTasks = openTasks.filter((task) => task.id !== sourceTask?.id);

  const markDone = async () => {
    if (!action.label) return;
    if (action.fromTask && !sourceTask) {
      // The backlog has not arrived yet. Refusing is the safe half of the
      // trade: creating a row here would duplicate the task we cannot see.
      notify("Les tâches ne sont pas encore chargées", { type: "warning" });
      return;
    }
    setPending(true);
    try {
      if (sourceTask) {
        await update(
          "tasks",
          {
            id: sourceTask.id,
            data: { done_date: new Date().toISOString() },
            previousData: sourceTask,
          },
          { returnPromise: true },
        );
      } else {
        // Archive first, clear second. If the task write fails the action stays
        // on the deal, which is recoverable; the reverse would lose it.
        await create(
          "tasks",
          {
            data: {
              deal_id: record.id,
              text: action.label,
              type: "Action",
              due_date: action.date ?? null,
              done_date: new Date().toISOString(),
              sales_id: action.ownerId ?? identity?.id ?? null,
            },
          },
          { returnPromise: true },
        );
        await update(
          "deals",
          {
            id: record.id,
            data: {
              next_action: null,
              next_action_date: null,
              next_action_owner_id: null,
            },
            previousData: record,
          },
          { returnPromise: true },
        );
      }
      notify("Action marquée comme faite — elle apparaît dans l'activité", {
        type: "info",
      });
      // `deals`, not just its list: the page itself is fed by `getOne`, whose
      // next action is derived from this very backlog by `deals_summary`.
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await queryClient.invalidateQueries({ queryKey: ["deals"] });
    } catch {
      notify("L'action n'a pas pu être marquée comme faite", { type: "error" });
    } finally {
      setPending(false);
    }
  };

  const isEmpty = action.status === "missing" || !action.label;
  const style = STATUS_STYLE[action.status] ?? STATUS_STYLE.upcoming;

  return (
    <Card className="p-4 flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Prochaine action
      </span>

      {isEmpty ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            {action.status === "not-expected"
              ? "Pas encore requise à cette étape."
              : "Aucune prochaine action définie."}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <DealCreateTaskButton />
            <Button asChild size="sm" variant="outline">
              <a href={`#/deals/${record.id}`}>
                <Pencil className="w-3.5 h-3.5" aria-hidden />
                Définir l'action
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">{action.label}</p>
            <p className="flex items-center gap-2 flex-wrap mt-1 text-sm">
              <span
                className="inline-flex items-center gap-1"
                style={{ color: style.color }}
              >
                <CalendarClock className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {action.date ? formatDate(action.date) : "Sans date"}
                {style.label && ` — ${style.label}`}
              </span>
              <span className="text-muted-foreground">·</span>
              <DealOwner
                ownerId={action.ownerId}
                title={
                  action.ownerIsDealOwner
                    ? "Responsable de l'opportunité"
                    : "Responsable de la prochaine action"
                }
              />
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={markDone}
              disabled={pending || (action.fromTask && backlogLoading)}
            >
              <Check className="w-3.5 h-3.5" aria-hidden />
              {pending ? "…" : "Marquer comme fait"}
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`#/deals/${record.id}`}>
                <Pencil className="w-3.5 h-3.5" aria-hidden />
                Modifier
              </a>
            </Button>
          </div>
        </div>
      )}

      {otherTasks.length > 0 && (
        <div className="flex flex-col gap-2 mt-2 pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {sourceTask ? "Autres tâches ouvertes" : "Tâches ouvertes"}
          </span>
          {otherTasks.map((task) => (
            // showContact stays off: we are already on the opportunity.
            <Task key={task.id} task={task} showTime={false} />
          ))}
        </div>
      )}
    </Card>
  );
};
