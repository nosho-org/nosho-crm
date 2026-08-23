import type { Task } from "../types";

/**
 * "Prochain meeting" shown read-only in the opportunity summary (issue #99).
 *
 * ## What the existing model can and cannot say
 *
 * There is no meeting entity attached to a deal. The only scheduled-interaction
 * data the CRM owns is `tasks`, which carry a `type`, a `due_date` and a `text`
 * — and which are linked to a **contact**, not to a deal. The deal summary
 * therefore derives its next meeting from the open tasks of the deal's own
 * contacts, exactly like the "Tâches programmées" block already rendered just
 * below it.
 *
 * Two consequences, deliberately not papered over:
 *
 * 1. A contact who appears on several opportunities contributes the same task
 *    to each of them. The task shown is genuinely the next meeting *with
 *    someone on this deal*; it is not provably about this deal.
 * 2. Only task types that denote an actual appointment are considered (see
 *    {@link MEETING_TASK_TYPES}). A "call" or a "follow-up" is not a meeting.
 *
 * Anything beyond that (a meeting truly owned by a deal, or a Google Calendar
 * event resolved back to a deal) needs a data contract this schema does not
 * have yet — see doc/src/content/docs/developers/deal-next-meeting.mdx. Nothing
 * here is synthesised: if no qualifying task exists, the block is not rendered.
 */

/**
 * Task types that represent a real appointment with the client.
 *
 * Values match `defaultTaskTypes` in root/defaultConfiguration.ts. Only these
 * qualify; `call`, `email`, `follow-up`, `ship`, `thank-you` and `none` do not.
 */
export const MEETING_TASK_TYPES = ["meeting", "demo", "lunch"] as const;

const MEETING_TASK_TYPE_SET: ReadonlySet<string> = new Set(MEETING_TASK_TYPES);

export const isMeetingTask = (task: Pick<Task, "type">): boolean =>
  typeof task.type === "string" && MEETING_TASK_TYPE_SET.has(task.type);

/**
 * Earliest not-yet-done meeting task still ahead.
 *
 * The cut-off is the **start of `now`'s day**, not the exact instant: tasks
 * postponed from the list are stored as a bare `YYYY-MM-DD` (see Task.tsx), so
 * a meeting scheduled for today carries no usable time-of-day and must not
 * disappear halfway through the day.
 *
 * @param tasks Candidate tasks — typically the open tasks of the deal contacts.
 * @param now   Reference instant; injected so the behaviour is testable.
 * @returns The next meeting task, or `null` when there is none.
 */
export const getNextMeetingTask = (
  tasks: Task[] | undefined,
  now: Date = new Date(),
): Task | null => {
  if (!tasks?.length) return null;

  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  const upcoming = tasks
    .filter((task) => !task.done_date)
    .filter(isMeetingTask)
    .map((task) => ({ task, dueAt: parseDueDate(task.due_date) }))
    .filter(
      (entry): entry is { task: Task; dueAt: number } =>
        entry.dueAt !== null && entry.dueAt >= cutoff,
    )
    .sort((a, b) => a.dueAt - b.dueAt);

  return upcoming[0]?.task ?? null;
};

const parseDueDate = (dueDate: string | null | undefined): number | null => {
  if (!dueDate) return null;
  const time = new Date(dueDate).getTime();
  return Number.isNaN(time) ? null : time;
};
