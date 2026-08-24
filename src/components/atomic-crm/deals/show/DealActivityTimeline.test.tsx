import { render } from "vitest-browser-react";
import {
  CoreAdminContext,
  RecordContextProvider,
  ResourceContextProvider,
  testDataProvider,
  testUI,
} from "ra-core";

import { DealActivityTimeline } from "./DealActivityTimeline";

/**
 * Regression cover for #109.
 *
 * The deal page renders the note composer directly, outside the
 * `<ReferenceManyField>` every other caller wraps it in. That removed both the
 * list context (`useListContext()` throws without a provider — the crash) and
 * the resource context (which resolved to `deals`, so writes would have landed
 * on the opportunity instead of its notes).
 *
 * `DealShowPage.test.tsx` never opens the composer, which is precisely why this
 * shipped green. These tests open it.
 */

const deal = { id: 36, name: "Centre Dentaire Mutualiste", company_id: 10 };

const note = {
  id: 322,
  deal_id: 36,
  type: null,
  text: "Relance après le comité",
  date: "2026-07-07T12:35:00Z",
  sales_id: 9,
  attachments: null,
};

const identity = { id: 9, fullName: "Simon Sallandre" };

const authProvider = {
  login: () => Promise.resolve(),
  logout: () => Promise.resolve(),
  checkAuth: () => Promise.resolve(),
  checkError: () => Promise.resolve(),
  getPermissions: () => Promise.resolve(),
  getIdentity: () => Promise.resolve(identity),
};

const buildProvider = () => {
  const create = vi.fn(() => Promise.resolve({ data: { ...note, id: 999 } }));
  const update = vi.fn(() => Promise.resolve({ data: note }));
  const deleteOne = vi.fn(() => Promise.resolve({ data: note }));

  const dataProvider = testDataProvider({
    getList: ((resource: string) =>
      Promise.resolve(
        resource === "deal_notes"
          ? { data: [note], total: 1 }
          : { data: [], total: 0 },
      )) as never,
    getOne: (() => Promise.resolve({ data: deal })) as never,
    getMany: (() => Promise.resolve({ data: [] })) as never,
    getManyReference: (() => Promise.resolve({ data: [], total: 0 })) as never,
    create: create as never,
    update: update as never,
    delete: deleteOne as never,
  });

  return { dataProvider, create, update, deleteOne };
};

const renderTimeline = (dataProvider: ReturnType<typeof testDataProvider>) =>
  render(
    <CoreAdminContext dataProvider={dataProvider} authProvider={authProvider}>
      {/* In the app these come from <Resource name="deals"> + <ShowBase>. */}
      <ResourceContextProvider value="deals">
        <RecordContextProvider value={deal}>
          <DealActivityTimeline />
          {/* Undoable deletes only reach the dataProvider once the undo
              window closes, which is the notification's job. */}
          <testUI.Notification />
        </RecordContextProvider>
      </ResourceContextProvider>
    </CoreAdminContext>,
  );

describe("DealActivityTimeline", () => {
  it("opens the composer without crashing (#109)", async () => {
    // Before the fix this threw
    // "useListContext must be used inside a ListContextProvider",
    // which the layout error boundary turned into the French error page.
    const { dataProvider } = buildProvider();
    const screen = await renderTimeline(dataProvider);

    await screen.getByRole("button", { name: "Ajouter une activité" }).click();

    await expect
      .element(screen.getByPlaceholder("Ajouter une note…"))
      .toBeVisible();
  });

  it("creates the activity on deal_notes, never on deals", async () => {
    const { dataProvider, create, update } = buildProvider();
    const screen = await renderTimeline(dataProvider);

    await screen.getByRole("button", { name: "Ajouter une activité" }).click();
    await screen
      .getByPlaceholder("Ajouter une note…")
      .fill("Point télé avec le Dr Germain");
    await screen.getByRole("button", { name: "Ajouter cette note" }).click();

    await vi.waitFor(() => expect(create).toHaveBeenCalled());

    const [resource, params] = create.mock.calls[0] as unknown as [
      string,
      { data: Record<string, unknown> },
    ];
    expect(resource).toBe("deal_notes");
    expect(params.data.deal_id).toBe(36);
    expect(params.data.sales_id).toBe(9);
    expect(params.data.type).toBe("note");
    // ISO, not the naive datetime-local string.
    expect(params.data.date).toMatch(/Z$|[+-]\d{2}:\d{2}$/);

    // Deals carry neither last_seen nor status: the old code PATCHed the
    // opportunity with two undefined fields on every save.
    expect(update).not.toHaveBeenCalled();
  });

  it("offers a type so the Appels / Meetings / Emails tabs can match", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderTimeline(dataProvider);

    await screen.getByRole("button", { name: "Ajouter une activité" }).click();

    await expect
      .element(screen.getByLabelText(/Type d'activité/i))
      .toBeInTheDocument();
  });

  it("edits an existing activity on deal_notes, never on deals", async () => {
    const { dataProvider, update } = buildProvider();
    const screen = await renderTimeline(dataProvider);

    const row = screen.getByText("Relance après le comité").first();
    await expect.element(row).toBeVisible();
    await row.hover();

    await screen.getByRole("button", { name: "Modifier l'activité" }).click();
    await screen.getByRole("button", { name: /Enregistrer/ }).click();

    await vi.waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toBe("deal_notes");
  });

  it("deletes an existing activity on deal_notes, never on deals", async () => {
    const { dataProvider, deleteOne } = buildProvider();
    const screen = await renderTimeline(dataProvider);

    const row = screen.getByText("Relance après le comité").first();
    await expect.element(row).toBeVisible();
    await row.hover();

    const deleteButton = screen.getByRole("button", {
      name: "Supprimer l'activité",
    });
    await expect.element(deleteButton).toBeVisible();
    await deleteButton.click();

    // Undoable deletes remove the row from the cache straight away.
    await expect
      .element(screen.getByText("Relance après le comité").first())
      .not.toBeInTheDocument();

    // Dismiss the undo notification, which is what commits the mutation.
    await vi.waitFor(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>(
        ".ra-notification button",
      );
      expect(buttons.length).toBeGreaterThan(0);
      buttons[buttons.length - 1].click();
    });

    await vi.waitFor(() => expect(deleteOne).toHaveBeenCalled());
    expect(deleteOne.mock.calls[0][0]).toBe("deal_notes");
  });
});
