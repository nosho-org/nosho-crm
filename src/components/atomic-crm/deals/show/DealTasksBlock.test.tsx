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
 * Couvre les deux blocs fusionnés par NOS-1164, et les régressions que
 * chacun portait.
 *
 * #114, moitié « Tâches » : `AddTask` — le composant qu'on réutiliserait
 * spontanément pour le CTA — lit son contact dans `useRecordContext()`. Sur
 * cette page le contexte porte un `Deal` : le réutiliser écrit l'identifiant
 * de l'opportunité dans `tasks.contact_id`, désignant en silence un contact
 * qui n'existe pas.
 *
 * #114, moitié « Prochaine action » : deux défauts livrés ensemble par
 * `8dd2513e` — le CTA était un `<a href="#/deals/:id">` qui menait à la
 * fenêtre d'édition, un formulaire sans champ d'action ; et « Marquer comme
 * fait » créait une *seconde* tâche déjà terminée en laissant l'originale en
 * cours, si bien que le bloc se redessinait à l'identique.
 *
 * NOS-1164 : la prochaine action est `tasks[0]`. Les deux cartes montraient
 * donc la même tâche, l'une au-dessus de l'autre.
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
  const update = vi.fn((_resource: string, params: { id: unknown }) =>
    Promise.resolve({ data: { ...taskViaContact, id: params.id } }),
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
    update: update as never,
  });

  return { dataProvider, create, getOne, update };
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

  it("met la tâche la plus proche en avant, et les suivantes dessous", async () => {
    // Le défaut que la fusion corrige : `nextTask` est `tasks[0]`, donc les
    // deux cartes montraient la même tâche. Elle ne doit apparaître qu'une
    // fois, et la seconde tâche une fois aussi.
    const { dataProvider } = buildProvider([
      taskViaContact,
      { ...taskViaContact, id: 413, text: "Envoyer le devis" },
    ]);
    const screen = await renderBlock(dataProvider);

    await expect.element(screen.getByText("Envoyer le devis")).toBeVisible();
    await expect
      .poll(() => {
        const text = screen.container.textContent ?? "";
        return text.split("Relancer le Dr Germain").length - 1;
      })
      .toBe(1);
  });

  it("n'annonce « Ensuite » que lorsqu'il y a bien une suite", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderBlock(dataProvider);

    await expect
      .element(screen.getByText("Relancer le Dr Germain"))
      .toBeVisible();
    expect(screen.container.textContent ?? "").not.toContain("Ensuite");
  });

  it("dérive le statut de la date d'échéance", async () => {
    const { dataProvider } = buildProvider([
      { ...taskViaContact, due_date: "2026-08-20T09:00:00Z" },
    ]);
    const screen = await renderBlock(dataProvider);

    await expect.element(screen.getByText(/En retard/)).toBeVisible();
  });

  it("termine la tâche affichée, sans en créer une seconde", async () => {
    const { dataProvider, create, update } = buildProvider();
    const screen = await renderBlock(dataProvider);

    await screen.getByRole("button", { name: /Marquer comme fait/ }).click();
    await vi.waitFor(() => expect(update).toHaveBeenCalled());

    const [resource, params] = update.mock.calls[0] as unknown as [
      string,
      { id: unknown; data: Record<string, unknown> },
    ];
    expect(resource).toBe("tasks");
    expect(params.id).toBe(412);
    expect(params.data.done_date).toMatch(/Z$|[+-]d{2}:d{2}$/);

    // Les deux moitiés de l'ancien défaut.
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls.some(([res]: [string]) => res === "deals")).toBe(
      false,
    );
  });

  it("offre un CTA qui crée une tâche, pas un lien vers la fenêtre d'édition", async () => {
    const { dataProvider } = buildProvider([]);
    const screen = await renderBlock(dataProvider);

    const cta = screen.getByRole("button", { name: /Définir l'action/ });
    await expect.element(cta).toBeVisible();

    // `<a href="#/deals/36">` était le défaut : il quittait la page pour un
    // formulaire sans champ d'action.
    expect(
      screen.container.querySelectorAll('a[href*="/deals/36"]').length,
    ).toBe(0);
  });
});
