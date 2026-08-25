import { useCallback, useMemo } from "react";
import { useGetList } from "ra-core";
import { useQueryClient } from "@tanstack/react-query";

import type { Deal, Task } from "../../types";
import type { NextActionStatus } from "../cockpit/dealFields";
import { daysUntil, startOfToday } from "../cockpit/dealDates";
import { buildDealTaskFilter, type DealTaskScope } from "./dealTaskFilter";

/**
 * ---------------------------------------------------------------------------
 * The opportunity's tasks (issue #114)
 * ---------------------------------------------------------------------------
 * One query, two blocks. "Prochaine tâche" and "Tâches" both call this hook;
 * React Query serves them from a single cache entry because the key is
 * identical, so they cannot show contradictory things — and `nextTask` is
 * literally `tasks[0]` rather than a second, separately-sorted request.
 */

/**
 * The four states a due date can produce. Deriving it from `NextActionStatus`
 * rather than redeclaring it means renaming a status in the cockpit breaks this
 * file at compile time instead of silently splitting the vocabulary in two.
 */
export type DealTaskStatus = Extract<
  NextActionStatus,
  "overdue" | "today" | "upcoming" | "undated"
>;

/**
 * The row and what we derived from it, kept apart on purpose.
 *
 * Spreading the derived fields onto the record would send them straight back to
 * the provider: both `<Task>` and "Marquer comme fait" pass the record as
 * `previousData`, so `status` and friends would be seeded into the `tasks`
 * cache on every optimistic update.
 */
export interface DealTask {
  task: Task;
  status: DealTaskStatus;
  /** Negative when overdue, null when the task carries no date. */
  daysUntil: number | null;
  /** Attached to the opportunity itself rather than to one of its contacts. */
  isDirect: boolean;
}

export interface UseDealTasksResult {
  /** Ordered exactly like `deals_summary`: due_date ASC nulls last, then id ASC. */
  tasks: DealTask[];
  nextTask: DealTask | null;
  isPending: boolean;
  error: Error | null;
  refresh: () => void;
}

export interface UseDealTasksOptions {
  scope?: DealTaskScope;
  /** Injectable for tests; defaults to local midnight. */
  today?: Date;
  perPage?: number;
}

const statusOf = (remaining: number | null): DealTaskStatus =>
  remaining === null
    ? "undated"
    : remaining < 0
      ? "overdue"
      : remaining === 0
        ? "today"
        : "upcoming";

/**
 * `order by due_date asc nulls last, id asc` — the ordering
 * 20260824150000_deals_next_task.sql uses to pick a deal's next task. ra-core
 * sends a single sort field and PostgREST is asked for `due_date.asc`, so the
 * tie-break and the nulls-last rule are reapplied here: without them the head
 * of this list and `deals_summary.next_task_text` could name different tasks.
 */
const byDueDateThenId = (a: DealTask, b: DealTask): number => {
  if (a.task.due_date !== b.task.due_date) {
    if (!a.task.due_date) return 1;
    if (!b.task.due_date) return -1;
    return a.task.due_date < b.task.due_date ? -1 : 1;
  }
  return Number(a.task.id) - Number(b.task.id);
};

export const useDealTasks = (
  deal: Deal | undefined,
  options: UseDealTasksOptions = {},
): UseDealTasksResult => {
  const { scope = "open", today, perPage = 50 } = options;
  const queryClient = useQueryClient();
  const dealId = deal?.id;

  const filter = useMemo(
    () =>
      dealId == null
        ? {}
        : buildDealTaskFilter(dealId, deal?.contact_ids, scope),
    [dealId, deal?.contact_ids, scope],
  );

  const {
    data,
    isPending,
    error: queryError,
  } = useGetList<Task>(
    "tasks",
    {
      filter,
      sort: { field: "due_date", order: "ASC" },
      pagination: { page: 1, perPage },
    },
    { enabled: dealId != null },
  );

  const tasks = useMemo(() => {
    const reference = today ?? startOfToday();
    return (data ?? [])
      .map((task): DealTask => {
        const remaining = daysUntil(task.due_date, reference);
        return {
          task,
          status: statusOf(remaining),
          daysUntil: remaining,
          isDirect:
            task.deal_id != null && String(task.deal_id) === String(dealId),
        };
      })
      .sort(byDueDateThenId);
  }, [data, today, dealId]);

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    // Completing a task changes `deals_summary.next_task_*`, which is what the
    // list and the kanban cards read. Scoping this to `["tasks"]` would leave
    // them showing an action that is already done.
    queryClient.invalidateQueries({ queryKey: ["deals"] });
  }, [queryClient]);

  return {
    tasks,
    nextTask: tasks[0] ?? null,
    isPending: dealId == null ? false : isPending,
    error: (queryError as Error) ?? null,
    refresh,
  };
};
