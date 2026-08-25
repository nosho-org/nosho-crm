import { render } from "vitest-browser-react";
import {
  CoreAdminContext,
  RecordContextProvider,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";
import { MemoryRouter } from "react-router-dom";

import { DealNextActionBlock } from "./DealNextActionBlock";

/**
 * Regression cover for #112.
 *
 * Since #108 the next action falls back to the opportunity's oldest open task.
 * "Marquer comme fait" never learned about it: it kept writing a *second*,
 * completed row and clearing `next_action*` columns that were already null, so
 * the original task stayed open, the action came straight back — "ça persiste
 * dans prochaine action" — and the timeline showed it twice.
 *
 * The backlog is asserted here too: a task created from the header would
 * otherwise be invisible, the timeline showing only what has already happened.
 */

const baseDeal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  company_id: 10,
  contact_ids: [] as number[],
  stage: "qualified",
  sales_id: 9,
  archived_at: null as string | null,
  next_action: null as string | null,
  next_action_date: null as string | null,
  next_action_owner_id: null as number | null,
  next_task_text: "Relancer le comité",
  next_task_date: "2026-09-01T09:00:00Z",
};

/** The row `deals_summary.next_task_*` pointed at. */
const sourceTask = {
  id: 501,
  deal_id: 36,
  contact_id: null,
  text: "Relancer le comité",
  type: "None",
  due_date: "2026-09-01T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

const otherTask = {
  id: 502,
  deal_id: 36,
  contact_id: null,
  text: "Envoyer la proposition chiffrée",
  type: "None",
  due_date: "2026-09-05T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

const authProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  getIdentity: () => Promise.resolve({ id: 9, fullName: "Simon Sallandre" }),
};

const buildProvider = (tasks = [sourceTask, otherTask]) => {
  const create = vi.fn(() => Promise.resolve({ data: { id: 999 } }));
  const update = vi.fn((_resource: string, params: any) =>
    Promise.resolve({ data: { ...params.previousData, ...params.data } }),
  );

  const dataProvider = testDataProvider({
    getList: ((resource: string) =>
      Promise.resolve(
        resource === "tasks"
          ? { data: tasks, total: tasks.length }
          : { data: [], total: 0 },
      )) as never,
    getOne: (() => Promise.resolve({ data: baseDeal })) as never,
    getMany: (() => Promise.resolve({ data: [] })) as never,
    create: create as never,
    update: update as never,
  });

  return { dataProvider, create, update };
};

const renderBlock = (
  dataProvider: ReturnType<typeof buildProvider>["dataProvider"],
  record: Record<string, unknown> = baseDeal,
) =>
  render(
    <MemoryRouter>
      {/* No configuration provider: useConfigurationContext falls back to
          defaultConfiguration, same as DealShowPage.test.tsx. */}
      <CoreAdminContext
        dataProvider={dataProvider}
        authProvider={authProvider as never}
      >
        <ResourceContextProvider value="deals">
          <RecordContextProvider value={record}>
            <DealNextActionBlock />
          </RecordContextProvider>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

type ProviderCall = [resource: string, params: any];

const callsOn = (mock: ReturnType<typeof vi.fn>, resource: string) =>
  (mock.mock.calls as ProviderCall[]).filter(([called]) => called === resource);

describe("DealNextActionBlock", () => {
  it("shows the opportunity's other open tasks", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderBlock(dataProvider);

    // The head of the backlog is the action itself, so it is not repeated.
    await expect.element(screen.getByText("Relancer le comité")).toBeVisible();
    await expect
      .element(screen.getByText("Envoyer la proposition chiffrée"))
      .toBeVisible();
    await expect
      .element(screen.getByText("Autres tâches ouvertes"))
      .toBeVisible();
  });

  it("completes the source task rather than creating a duplicate", async () => {
    const { dataProvider, create, update } = buildProvider();
    const screen = await renderBlock(dataProvider);

    await expect.element(screen.getByText("Relancer le comité")).toBeVisible();
    await screen.getByRole("button", { name: /marquer comme fait/i }).click();

    await expect.poll(() => callsOn(update, "tasks").length).toBe(1);
    const [, params] = callsOn(update, "tasks")[0];
    expect(params.id).toBe(501);
    expect(params.data.done_date).toBeTruthy();

    // The bug: a second completed row, leaving the original open.
    expect(callsOn(create, "tasks")).toHaveLength(0);
  });

  it("still archives a hand-typed action the old way", async () => {
    // `deals.next_action` has no row to complete, so it must be written to
    // `tasks` as a completed one before the columns are cleared.
    const { dataProvider, create, update } = buildProvider([otherTask]);
    const screen = await renderBlock(dataProvider, {
      ...baseDeal,
      next_action: "Rappeler le directeur",
      next_action_date: "2026-09-02T09:00:00Z",
      next_task_text: null,
      next_task_date: null,
    });

    await expect
      .element(screen.getByText("Rappeler le directeur"))
      .toBeVisible();
    await screen.getByRole("button", { name: /marquer comme fait/i }).click();

    await expect.poll(() => callsOn(create, "tasks").length).toBe(1);
    expect(callsOn(create, "tasks")[0][1].data).toMatchObject({
      deal_id: 36,
      text: "Rappeler le directeur",
    });
    expect(callsOn(create, "tasks")[0][1].data.done_date).toBeTruthy();

    await expect
      .poll(() => callsOn(update, "deals")[0]?.[1].data)
      .toMatchObject({ next_action: null, next_action_date: null });
  });

  it("offers task creation when there is no next action", async () => {
    const { dataProvider } = buildProvider([]);
    const screen = await renderBlock(dataProvider, {
      ...baseDeal,
      next_task_text: null,
      next_task_date: null,
    });

    await expect
      .element(screen.getByRole("button", { name: /créer une tâche/i }))
      .toBeVisible();
  });
});
