import type { Task } from "../../types";
import { mergeOpenTasks } from "./dealOpenTasks";

const task = (overrides: Partial<Task> & Pick<Task, "id">): Task =>
  ({
    due_date: "2026-09-01T09:00:00Z",
    text: "Relancer",
    type: "None",
    ...overrides,
  }) as Task;

describe("mergeOpenTasks", () => {
  it("keeps a task reachable through both queries only once", () => {
    // A task carrying deal_id AND a contact_id of that deal comes back twice.
    const both = task({ id: 1, deal_id: 36, contact_id: 7 });
    expect(mergeOpenTasks([both], [both]).map((t) => t.id)).toEqual([1]);
  });

  it("orders by due date, earliest first", () => {
    const merged = mergeOpenTasks(
      [task({ id: 2, due_date: "2026-09-10T09:00:00Z" })],
      [task({ id: 1, due_date: "2026-09-02T09:00:00Z" })],
    );
    expect(merged.map((t) => t.id)).toEqual([1, 2]);
  });

  it("sorts undated tasks last, like the view's NULLS LAST", () => {
    // `deals_summary` orders by `due_date asc nulls last`: an undated task is a
    // fallback, not the next action.
    const merged = mergeOpenTasks([
      task({ id: 1, due_date: undefined as never }),
      task({ id: 2, due_date: "2026-09-10T09:00:00Z" }),
    ]);
    expect(merged.map((t) => t.id)).toEqual([2, 1]);
  });

  it("breaks a due-date tie on id, like the view", () => {
    const merged = mergeOpenTasks([
      task({ id: 9, due_date: "2026-09-02T09:00:00Z" }),
      task({ id: 4, due_date: "2026-09-02T09:00:00Z" }),
    ]);
    expect(merged.map((t) => t.id)).toEqual([4, 9]);
  });

  it("tolerates missing lists while a query is still loading", () => {
    expect(mergeOpenTasks(undefined, null, [task({ id: 1 })])).toHaveLength(1);
    expect(mergeOpenTasks(undefined, undefined)).toEqual([]);
  });
});
