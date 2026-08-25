import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router-dom";
import {
  CoreAdminContext,
  RecordContextProvider,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";
import type { GetListParams } from "ra-core";

import type { Deal } from "../../types";
import { DealNextMeetingCard } from "./DealNextMeetingCard";

/**
 * "Prochain meeting" (#99) shipped, then `8dd2513e` unmounted it along with the
 * rest of the task surface. Remounted by #114 — and rewired, because the filter
 * it carried (`contact_id@in` alone) misses a task attached straight to the
 * opportunity.
 */

const deal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  contact_ids: [7, 9],
  sales_id: 9,
} as unknown as Deal;

const meeting = {
  id: 1,
  contact_id: 7,
  deal_id: null,
  type: "meeting",
  text: "Comité de direction",
  due_date: "2099-01-15T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

/** A real appointment attached to the deal itself, not to a contact. */
const demoOnDeal = {
  ...meeting,
  id: 2,
  contact_id: null,
  deal_id: 36,
  type: "demo",
  text: "Démo produit",
  due_date: "2098-06-01T09:00:00Z",
};

const buildProvider = (tasks: unknown[]) => {
  const getList = vi.fn((resource: string) =>
    Promise.resolve(
      resource === "tasks"
        ? { data: tasks, total: tasks.length }
        : { data: [], total: 0 },
    ),
  );

  return {
    getList,
    dataProvider: testDataProvider({
      getList: getList as never,
      getOne: ((_r: string, p: { id: unknown }) =>
        Promise.resolve({ data: { id: p.id } })) as never,
      getMany: (() => Promise.resolve({ data: [] })) as never,
    }),
  };
};

const renderCard = (dataProvider: ReturnType<typeof testDataProvider>) =>
  render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={dataProvider}>
        <ResourceContextProvider value="deals">
          <RecordContextProvider value={deal}>
            <DealNextMeetingCard />
          </RecordContextProvider>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

describe("DealNextMeetingCard", () => {
  it("reaches tasks by deal_id OR the deal's contacts, like every other block", async () => {
    const { dataProvider, getList } = buildProvider([meeting]);
    const screen = await renderCard(dataProvider);

    await expect.element(screen.getByText("Prochain meeting")).toBeVisible();

    const call = getList.mock.calls.find(
      ([resource]: [string]) => resource === "tasks",
    ) as [string, GetListParams];
    expect(call[1].filter).toMatchObject({
      "@or": { "deal_id@eq": 36, "contact_id@in": "(7,9)" },
    });
  });

  it("surfaces an appointment attached straight to the opportunity", async () => {
    // The old `contact_id@in`-only filter could never see this one.
    const { dataProvider } = buildProvider([demoOnDeal]);
    const screen = await renderCard(dataProvider);

    await expect.element(screen.getByText(/Démo produit/)).toBeVisible();
  });

  it("renders nothing when no task is an actual appointment", async () => {
    // A call or a follow-up is not a meeting: better an absent block than a
    // heading over a date that means something else.
    const { dataProvider } = buildProvider([
      { ...meeting, type: "call" },
      { ...meeting, id: 3, type: "follow-up" },
    ]);
    const screen = await renderCard(dataProvider);

    await expect
      .element(screen.getByText("Prochain meeting"))
      .not.toBeInTheDocument();
  });
});
