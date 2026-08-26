import type { Task } from "../../types";

/**
 * ---------------------------------------------------------------------------
 * The opportunity's open-task backlog (#112)
 * ---------------------------------------------------------------------------
 * A task reaches an opportunity two ways — directly through `tasks.deal_id`, or
 * through one of its contacts — and `deals_summary.next_task_*` picks the head
 * of exactly that union:
 *
 *     where t.done_date is null
 *       and (t.deal_id = d.id or t.contact_id = any(d.contact_ids))
 *     order by t.due_date asc nulls last, t.id asc
 *
 * PostgREST can express that OR, but the FakeRest adapter cannot: it maps `@or`
 * onto its full-text `q=` and keeps only the first value
 * (`transformOrFilter.ts`), so the demo provider would silently answer a
 * different question. Two plain queries merged here behave identically on both.
 *
 * Reproducing the view's ordering matters beyond tidiness: the block above the
 * list names the head of this list as the next action, so a different order
 * would have it point at a task the user cannot see.
 */

const compareIds = (a: Task, b: Task): number => {
  if (typeof a.id === "number" && typeof b.id === "number") return a.id - b.id;
  return String(a.id).localeCompare(String(b.id));
};

export function mergeOpenTasks(
  ...lists: (Task[] | undefined | null)[]
): Task[] {
  const byId = new Map<string, Task>();
  for (const list of lists) {
    // A task carrying both a deal_id and a contact_id of that deal comes back
    // from both queries; the first copy wins, they are the same row.
    for (const task of list ?? []) {
      if (task?.id == null) continue;
      if (!byId.has(String(task.id))) byId.set(String(task.id), task);
    }
  }

  return [...byId.values()].sort((a, b) => {
    // NULLS LAST: an undated task is a fallback, never the winner.
    if (!a.due_date && !b.due_date) return compareIds(a, b);
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    const byDate = a.due_date.localeCompare(b.due_date);
    return byDate !== 0 ? byDate : compareIds(a, b);
  });
}
