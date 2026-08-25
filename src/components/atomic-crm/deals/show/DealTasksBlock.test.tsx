import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router-dom";
import {
  CoreAdminContext,
  RecordContextProvider,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";

import type { Deal } from "../../types";
import { DealTasksBlock } from "./DealTasksBlock";

/**
 * Regression cover for #114: the block `8dd2513e` dropped, and the trap waiting
 * for whoever put it back.
 *
 * `AddTask` — the obvious component to reuse for the CTA — reads its contact
 * from `useRecordContext()`. On this page that context holds a `Deal`, so
 * reusing it writes the opportunity's id into `tasks.contact_id`: a task
 * pointing at a contact that does not exist, silently.
 */

const deal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  company_id: 10,
  contact_ids: [7, 9],
  stage: "qualified",
  sales_id: 9,
} as unknown as Deal;

const taskViaContact = {
  id: 412,
  contact_id: 7,
  deal_id: null,
  type: "none",
  text: "Relancer le Dr Germain",
  due_date: "2026-08-26T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

const identity = { id: 9, fullName: "Simon Sallandre" };

/**
 * Just enough to give the sheet's footer its real label. Without a provider
 * ra-core echoes the key, and the test would assert on `ra.action.save` —
 * a string no user ever sees.
 */
const i18nProvider = {
  translate: (key: string, options?: { _?: string }) =>
    key === "ra.action.save" ? "Enregistrer" : (options?._ ?? key),
  changeLocale: () => Promise.resolve(),
  getLocale: () => "fr",
};

const authProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  getIdentity: () => Promise.resolve(identity),
};

const buildProvider = (tasks: unknown[] = [taskViaContact]) => {
  const create = vi.fn(() =>
    Promise.resolve({ data: { ...taskViaContact, id: 999 } }),
  );
  // Mirrors FakeRest and PostgREST: asking for a row by `undefined` is an
  // error, not an empty result.
  const getOne = vi.fn((_resource: string, params: { id: unknown }) =>
    params.id == null
      ? Promise.reject(new Error("No item with identifier undefined"))
      : Promise.resolve({ data: { id: params.id } }),
  );

  const dataProvider = testDataProvider({
    getList: ((resource: string) =>
      Promise.resolve(
        resource === "tasks"
          ? { data: tasks, total: tasks.length }
          : { data: [], total: 0 },
      )) as never,
    getOne: getOne as never,
    getMany: (() => Promise.resolve({ data: [] })) as never,
    create: create as never,
    update: (() => Promise.resolve({ data: taskViaContact })) as never,
  });

  return { dataProvider, create, getOne };
};

const renderBlock = (dataProvider: ReturnType<typeof testDataProvider>) =>
  render(
    <MemoryRouter>
      <CoreAdminContext
        dataProvider={dataProvider}
        authProvider={authProvider}
        i18nProvider={i18nProvider}
      >
        <ResourceContextProvider value="deals">
          <RecordContextProvider value={deal}>
            <DealTasksBlock />
          </RecordContextProvider>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

describe("DealTasksBlock", () => {
  it("lists pending tasks attached through the deal's contacts (#114)", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderBlock(dataProvider);

    await expect
      .element(screen.getByText("Relancer le Dr Germain"))
      .toBeVisible();
  });

  it("says so when the opportunity has no pending task", async () => {
    const { dataProvider } = buildProvider([]);
    const screen = await renderBlock(dataProvider);

    await expect
      .element(screen.getByText(/Aucune tâche en cours/))
      .toBeVisible();
  });

  it("renders a task that has no contact without querying for id undefined", async () => {
    // A task created from an opportunity carries `deal_id` and no contact.
    // Rendering its contact reference anyway asked the provider for
    // `undefined` and surfaced as "No item with identifier undefined".
    const { dataProvider, getOne } = buildProvider([
      { ...taskViaContact, id: 500, contact_id: null, deal_id: 36 },
    ]);
    const screen = await renderBlock(dataProvider);

    await expect
      .element(screen.getByText("Relancer le Dr Germain"))
      .toBeVisible();

    expect(
      getOne.mock.calls.some(([, params]: [string, { id: unknown }]) =>
        params == null ? false : params.id == null,
      ),
    ).toBe(false);
  });

  it("creates the task on the opportunity, never mistaking it for a contact", async () => {
    const { dataProvider, create } = buildProvider([]);
    const screen = await renderBlock(dataProvider);

    await screen.getByRole("button", { name: /Ajouter une tâche/ }).click();
    await screen.getByLabelText(/description/i).fill("Envoyer la proposition");
    await screen.getByRole("button", { name: /Enregistrer/ }).click();

    await vi.waitFor(() => expect(create).toHaveBeenCalled());

    const [resource, params] = create.mock.calls[0] as unknown as [
      string,
      { data: Record<string, unknown> },
    ];
    expect(resource).toBe("tasks");
    expect(params.data.deal_id).toBe(36);
    expect(params.data.sales_id).toBe(9);
    // The `AddTask` trap: the deal's id landing in contact_id.
    expect(params.data.contact_id).not.toBe(36);
  });
});
