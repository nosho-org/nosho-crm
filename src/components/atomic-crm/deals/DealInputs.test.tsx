import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import {
  CoreAdminContext,
  Form,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";
import { MemoryRouter } from "react-router-dom";

import { i18nProvider } from "../root/i18nProvider";
import { DealInputs } from "./DealInputs";

/**
 * Issue #122 — an opportunity cannot be created half-filled.
 *
 * The rule is deliberately asymmetric: mandatory on creation, silent on
 * edition. Production carries 219 open opportunities, 198 of them without a
 * lead source; requiring the same six fields on the edit form would lock every
 * one of them behind a form nobody asked to fill. Both halves are asserted
 * here, because the asymmetry is the point and a refactor that "simplifies" it
 * would break the edit path for two hundred deals.
 */

/** Everything the form already required before #122. */
const REQUIRED_BEFORE_122 = {
  name: "Centre Dentaire Mutualiste — No-show",
  company_id: 10,
  amount: 18000,
  expected_closing_date: "2026-09-30",
  stage: "qualified",
};

const dataProvider = testDataProvider({
  getList: (() => Promise.resolve({ data: [], total: 0 })) as never,
  getMany: ((resource: string) =>
    Promise.resolve({
      data:
        resource === "companies"
          ? [{ id: 10, name: "Centre Dentaire Mutualiste" }]
          : [],
    })) as never,
  getOne: (() =>
    Promise.resolve({
      data: { id: 10, name: "Centre Dentaire Mutualiste" },
    })) as never,
});

const renderForm = ({
  mode,
  defaultValues = {},
  onSubmit,
}: {
  mode: "create" | "edit";
  defaultValues?: Record<string, unknown>;
  onSubmit: (values: unknown) => void;
}) =>
  render(
    <MemoryRouter>
      {/* No configuration provider: useConfigurationContext reads the ra-core
          store and falls back to defaultConfiguration, which is the real
          production vocabulary. */}
      <CoreAdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
        <ResourceContextProvider value="deals">
          <Form onSubmit={onSubmit} defaultValues={defaultValues}>
            <DealInputs mode={mode} />
            <button type="submit">Enregistrer</button>
          </Form>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

/** The error shown under a field, or undefined when the field is happy. */
const errorUnder = (container: HTMLElement, label: string) => {
  const field = [...container.querySelectorAll("[data-slot=form-item]")].find(
    (node) => node.textContent?.includes(label),
  );
  return field?.querySelector("[data-slot=form-message]")?.textContent;
};

describe("DealInputs", () => {
  beforeAll(() => {
    page.viewport(1600, 1200);
  });

  it("refuses to submit a creation missing the mandatory fields", async () => {
    const onSubmit = vi.fn();
    const screen = await renderForm({ mode: "create", onSubmit });

    await screen.getByRole("button", { name: "Enregistrer" }).click();

    await expect
      .poll(
        () =>
          screen.container.querySelectorAll("[data-slot=form-message]").length,
      )
      .toBeGreaterThan(0);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flags every field issue #122 adds, not just the historical ones", async () => {
    const onSubmit = vi.fn();
    // Only the pre-#122 fields are filled, so whatever still fails is exactly
    // what this issue added.
    const screen = await renderForm({
      mode: "create",
      defaultValues: REQUIRED_BEFORE_122,
      onSubmit,
    });

    await screen.getByRole("button", { name: "Enregistrer" }).click();

    await expect
      .poll(() => errorUnder(screen.container, "Type d'opportunité"))
      .toBe("Ce champ est requis");
    expect(errorUnder(screen.container, "Produit(s)")).toBe(
      "Ce champ est requis",
    );
    expect(errorUnder(screen.container, "Catégorie")).toBe(
      "Ce champ est requis",
    );
    expect(errorUnder(screen.container, "Source du lead")).toBe(
      "Ce champ est requis",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("still saves an edition that predates the v2 model", async () => {
    const onSubmit = vi.fn();
    const screen = await renderForm({
      mode: "edit",
      // A real production row: no type, no product, no category, no source.
      defaultValues: { ...REQUIRED_BEFORE_122, id: 1, sales_id: 1 },
      onSubmit,
    });

    await screen.getByRole("button", { name: "Enregistrer" }).click();

    await expect.poll(() => onSubmit.mock.calls.length).toBe(1);
  });
});
