import { render } from "vitest-browser-react";
import { MemoryRouter } from "react-router-dom";
import {
  CoreAdminContext,
  RecordContextProvider,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";

import type { Deal } from "../../types";
import { DealNextTaskBlock } from "./DealNextTaskBlock";

/**
 * Regression cover for #114.
 *
 * Two failures shipped together in `8dd2513e`:
 *
 *   * the CTA was `<a href="#/deals/:id">`, which lands on the edit dialog —
 *     a form with no next-action field, so it could not do what it offered;
 *   * "Marquer comme fait" created a *second*, already-completed task and
 *     cleared the (empty) `next_action*` columns, leaving the task it was
 *     showing still pending. The block redrew identically and the button looked
 *     dead.
 */

const deal = {
  id: 36,
  name: "Centre Dentaire Mutualiste",
  company_id: 10,
  contact_ids: [7, 9],
  stage: "qualified",
  sales_id: 9,
} as unknown as Deal;

const pendingTask = {
  id: 412,
  contact_id: 7,
  deal_id: null,
  type: "none",
  text: "Relancer le Dr Germain",
  due_date: "2026-08-20T09:00:00Z",
  done_date: null,
  sales_id: 9,
};

const buildProvider = (tasks: unknown[] = [pendingTask]) => {
  const create = vi.fn(() => Promise.resolve({ data: { id: 1 } }));
  const update = vi.fn((_resource: string, params: { id: unknown }) =>
    Promise.resolve({ data: { ...pendingTask, id: params.id } }),
  );

  const dataProvider = testDataProvider({
    getList: ((resource: string) =>
      Promise.resolve(
        resource === "tasks"
          ? { data: tasks, total: tasks.length }
          : { data: [], total: 0 },
      )) as never,
    getOne: ((resource: string, params: { id: unknown }) =>
      Promise.resolve({
        data:
          resource === "sales"
            ? { id: params.id, first_name: "Simon", last_name: "Sallandre" }
            : { id: params.id },
      })) as never,
    getMany: (() => Promise.resolve({ data: [] })) as never,
    create: create as never,
    update: update as never,
  });

  return { dataProvider, create, update };
};

const renderBlock = (dataProvider: ReturnType<typeof testDataProvider>) =>
  render(
    <MemoryRouter>
      <CoreAdminContext dataProvider={dataProvider}>
        <ResourceContextProvider value="deals">
          <RecordContextProvider value={deal}>
            <DealNextTaskBlock />
          </RecordContextProvider>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

describe("DealNextTaskBlock", () => {
  it("shows the pending task reached through a contact (#114)", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderBlock(dataProvider);

    await expect
      .element(screen.getByText("Relancer le Dr Germain"))
      .toBeVisible();
  });

  it("derives the status from the due date", async () => {
    const { dataProvider } = buildProvider();
    const screen = await renderBlock(dataProvider);

    // The fixture is due 2026-08-20, well behind any run date.
    await expect.element(screen.getByText(/En retard/)).toBeVisible();
  });

  it("completes the task it is showing, without creating a second one", async () => {
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
    expect(params.data.done_date).toMatch(/Z$|[+-]\d{2}:\d{2}$/);

    // The two halves of the old bug.
    expect(create).not.toHaveBeenCalled();
    expect(update.mock.calls.some(([res]: [string]) => res === "deals")).toBe(
      false,
    );
  });

  it("offers a task-creating CTA, not a link to the edit dialog", async () => {
    const { dataProvider } = buildProvider([]);
    const screen = await renderBlock(dataProvider);

    const cta = screen.getByRole("button", {
      name: /Définir l'action/,
    });
    await expect.element(cta).toBeVisible();

    // `<a href="#/deals/36">` was the bug: it left the page for a form that has
    // no next-action field.
    expect(
      screen.container.querySelectorAll('a[href*="/deals/36"]').length,
    ).toBe(0);
  });
});
