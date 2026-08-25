import { render } from "vitest-browser-react";
import { CoreAdminContext, testDataProvider } from "ra-core";
import type { GetListParams } from "ra-core";

import type { Deal } from "../../types";
import { useDealTasks } from "./useDealTasks";

/**
 * Regression cover for #114.
 *
 * `8dd2513e` turned the deal page into a page and left `{ deal_id: dealId }` as
 * the only way it reached tasks. Production had 0 tasks carrying a `deal_id`
 * and 100 pending ones carrying a `contact_id`, so all 215 open opportunities
 * showed nothing — while 96 of them had a pending task one join away.
 *
 * The first test asserts the filter that goes *out* and the task that comes
 * *back*: asserting only the filter would pass on a hook that then dropped the
 * rows, and asserting only the result would pass on a stubbed provider that
 * ignores the filter.
 */

const withContacts: Deal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  contact_ids: [7, 9],
} as Deal;

const withoutContacts: Deal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  contact_ids: [],
} as unknown as Deal;

/** Attached through a contact, `deal_id` NULL — the production shape. */
const taskViaContact = {
  id: 1,
  contact_id: 7,
  deal_id: null,
  type: "none",
  text: "Relancer le Dr Germain",
  due_date: "2026-08-26T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

/**
 * Enough PostgREST to make the filter matter.
 *
 * A stub that returns its fixture whatever it is asked would let "the task
 * comes back" pass against the broken `{ deal_id }` filter — the assertion
 * would be measuring the fixture, not the code. So the rows are matched the way
 * the server would match them.
 */
const applyFilter = (
  filter: Record<string, unknown>,
  task: Record<string, unknown>,
): boolean => {
  const matchesLeaf = (key: string, value: unknown): boolean => {
    if (key === "deal_id@eq") return task.deal_id === value;
    if (key === "contact_id@in") {
      const ids = String(value).replace(/[()]/g, "").split(",").filter(Boolean);
      return ids.includes(String(task.contact_id));
    }
    if (key === "done_date@is") return task.done_date == null;
    if (key === "done_date@not.is") return task.done_date != null;
    throw new Error(`Filtre non géré par le faux provider : ${key}`);
  };

  return Object.entries(filter).every(([key, value]) =>
    key === "@or"
      ? Object.entries(value as Record<string, unknown>).some(([k, v]) =>
          matchesLeaf(k, v),
        )
      : matchesLeaf(key, value),
  );
};

const buildProvider = (tasks: Record<string, unknown>[] = [taskViaContact]) => {
  const getList = vi.fn((resource: string, params: GetListParams) => {
    if (resource !== "tasks") return Promise.resolve({ data: [], total: 0 });
    const data = tasks.filter((task) =>
      applyFilter(params.filter as Record<string, unknown>, task),
    );
    return Promise.resolve({ data, total: data.length });
  });

  return {
    getList,
    dataProvider: testDataProvider({
      getList: getList as never,
      getMany: (() => Promise.resolve({ data: [] })) as never,
    }),
  };
};

/** Last filter the hook asked the provider for, on the `tasks` resource. */
const taskFilterOf = (getList: ReturnType<typeof vi.fn>) => {
  const call = getList.mock.calls.findLast(
    ([resource]: [string]) => resource === "tasks",
  ) as [string, GetListParams] | undefined;
  return call?.[1].filter as Record<string, unknown> | undefined;
};

const Probe = ({ deal }: { deal: Deal }) => {
  const { tasks, nextTask, isPending } = useDealTasks(deal, {
    today: new Date(2026, 7, 25),
  });
  if (isPending) return <span>chargement</span>;
  return (
    <ul>
      <li data-testid="next">
        {nextTask ? String(nextTask.task.id) : "aucune"}
      </li>
      <li data-testid="order">{tasks.map((t) => t.task.id).join(",")}</li>
      <li data-testid="status">{nextTask?.status ?? "-"}</li>
    </ul>
  );
};

const renderProbe = (
  deal: Deal,
  dataProvider: ReturnType<typeof testDataProvider>,
) =>
  render(
    <CoreAdminContext dataProvider={dataProvider}>
      <Probe deal={deal} />
    </CoreAdminContext>,
  );

describe("useDealTasks", () => {
  it("returns a task attached through a contact, not just by deal_id (#114)", async () => {
    const { dataProvider, getList } = buildProvider();
    const screen = await renderProbe(withContacts, dataProvider);

    await expect.element(screen.getByTestId("next")).toHaveTextContent("1");

    const filter = taskFilterOf(getList)!;
    expect(filter["done_date@is"]).toBeNull();
    expect(filter["@or"]).toEqual({
      "deal_id@eq": 36,
      "contact_id@in": "(7,9)",
    });
    // The exact key the broken version sent, and nothing else.
    expect(filter).not.toHaveProperty("deal_id");
  });

  it("does not send contact_id@in.() when the opportunity has no contact", async () => {
    const { dataProvider, getList } = buildProvider([]);
    const screen = await renderProbe(withoutContacts, dataProvider);

    await expect
      .element(screen.getByTestId("next"))
      .toHaveTextContent("aucune");

    const filter = taskFilterOf(getList)!;
    expect(filter).toEqual({ "done_date@is": null, "deal_id@eq": 36 });
  });

  it("orders like deals_summary: due_date ASC nulls last, then id ASC", async () => {
    // Deliberately shuffled, with a tie and an undated task.
    const { dataProvider } = buildProvider([
      { ...taskViaContact, id: 5, due_date: null },
      { ...taskViaContact, id: 4, due_date: "2026-09-01T09:00:00Z" },
      { ...taskViaContact, id: 3, due_date: "2026-08-26T09:00:00Z" },
      { ...taskViaContact, id: 2, due_date: "2026-08-26T09:00:00Z" },
    ]);
    const screen = await renderProbe(withContacts, dataProvider);

    await expect
      .element(screen.getByTestId("order"))
      .toHaveTextContent("2,3,4,5");
  });

  it("derives the status from the due date", async () => {
    const { dataProvider } = buildProvider([
      { ...taskViaContact, due_date: "2026-08-20T09:00:00Z" },
    ]);
    const screen = await renderProbe(withContacts, dataProvider);

    await expect
      .element(screen.getByTestId("status"))
      .toHaveTextContent("overdue");
  });
});
