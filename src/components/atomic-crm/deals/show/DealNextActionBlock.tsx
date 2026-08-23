import { useState } from "react";
import { CalendarClock, Check, Pencil } from "lucide-react";
import {
  useCreate,
  useGetIdentity,
  useNotify,
  useRecordContext,
  useRefresh,
  useUpdate,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useConfigurationContext } from "../../root/ConfigurationContext";
import type { Deal } from "../../types";
import { getDealNextAction } from "../cockpit/dealFields";
import { startOfToday } from "../cockpit/dealDates";
import { formatDate } from "../cockpit/dealFormat";
import { DealOwner } from "../cockpit/DealFieldBadges";

/**
 * ---------------------------------------------------------------------------
 * Prochaine action (NOS-957 §2)
 * ---------------------------------------------------------------------------
 * "C'est volontairement le premier bloc après le header. Une opportunité
 * ouverte doit idéalement toujours avoir une prochaine action."
 *
 * Marking one done must never lose it: the action is written to `tasks` as a
 * completed row — which is what makes it appear in the timeline below — and
 * only then are the three `next_action*` fields cleared. "Ne jamais supprimer
 * l'action précédente."
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
  const refresh = useRefresh();
  const [pending, setPending] = useState(false);

  if (!record) return null;

  const action = getDealNextAction(record, {
    dealStages,
    pipelineStatuses: dealPipelineStatuses,
    fromStage: dealNextActionFromStage,
    today: startOfToday(),
  });

  const markDone = async () => {
    if (!action.label) return;
    setPending(true);
    try {
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
      notify("Action marquée comme faite — elle apparaît dans l'activité", {
        type: "info",
      });
      refresh();
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
          <Button asChild size="sm" variant="outline">
            <a href={`#/deals/${record.id}`}>
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Définir l'action
            </a>
          </Button>
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
            <Button size="sm" onClick={markDone} disabled={pending}>
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
    </Card>
  );
};
