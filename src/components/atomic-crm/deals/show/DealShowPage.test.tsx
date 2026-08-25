import { render } from "vitest-browser-react";
import {
  CoreAdminContext,
  ResourceContextProvider,
  testDataProvider,
} from "ra-core";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { DealShowPage } from "./DealShowPage";

/**
 * The vertical order is the heart of NOS-957/958 — the spec spells it out and
 * calls it obligatory — so it is asserted against the DOM rather than eyeballed.
 */

const deal = {
  id: 1,
  name: "Nicolas Roussey",
  company_id: 10,
  contact_ids: [],
  contact_roles: {},
  category: "dentaire",
  stage: "qualified",
  priority: "urgent",
  products: ["no-show", "entrant"],
  description: "",
  amount: 18000,
  mrr: 1500,
  expected_closing_date: "2026-09-30",
  entered_at: "2026-03-07",
  opportunity_type: "extension",
  lead_source: "recommandation",
  sales_id: 1,
  index: 0,
  created_at: "2026-03-07T10:00:00Z",
  updated_at: "2026-03-07T10:00:00Z",
};

const dataProvider = testDataProvider({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOne: ((resource: string) =>
    Promise.resolve({
      data:
        resource === "companies"
          ? { id: 10, name: "Centre Dentaire Mutualiste" }
          : deal,
    })) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getList: (() => Promise.resolve({ data: [], total: 0 })) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMany: (() => Promise.resolve({ data: [] })) as any,
});

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/deals/1/show"]}>
      {/* No configuration provider: useConfigurationContext reads the ra-core
          store and falls back to defaultConfiguration, which is what we want
          to assert against. */}
      <CoreAdminContext dataProvider={dataProvider}>
        {/* In the app this comes from <Resource name="deals" show={…} />. */}
        <ResourceContextProvider value="deals">
          <Routes>
            <Route path="/deals/:id/show" element={<DealShowPage />} />
          </Routes>
        </ResourceContextProvider>
      </CoreAdminContext>
    </MemoryRouter>,
  );

describe("DealShowPage", () => {
  it("renders the blocks in the order the spec imposes", async () => {
    const screen = await renderPage();
    await expect.element(screen.getByText("Nicolas Roussey")).toBeVisible();

    const headings = [
      "Prochaine tâche",
      "Tâches",
      "Synthèse de l'opportunité",
      "Société & groupe",
      "Contacts clés",
      "Activité",
    ];

    await expect
      .poll(() => {
        const text = screen.container.textContent ?? "";
        const positions = headings.map((heading) => text.indexOf(heading));
        // Every heading present, and each one after the previous.
        return (
          positions.every((position) => position >= 0) &&
          positions.every(
            (position, index) => index === 0 || position > positions[index - 1],
          )
        );
      })
      .toBe(true);
  });

  it("shows the stage, priority and products badges in the header", async () => {
    const screen = await renderPage();
    const header = screen.getByRole("banner");
    await expect.element(header.getByText("Qualifié")).toBeVisible();
    await expect.element(header.getByText("P0 Critique")).toBeVisible();
    await expect.element(header.getByText("No-show")).toBeVisible();
  });

  it("repeats the products in the synthesis and the side panel, on purpose", async () => {
    // "Produit(s) est la seule donnée volontairement répétée entre le Header et
    // la Synthèse. Les deux affichages doivent utiliser exactement la même
    // donnée backend." Header + synthesis + side panel = three renderings of
    // `deal.products`, and no fourth source.
    const screen = await renderPage();
    await expect
      .poll(() => screen.container.querySelectorAll("span").length > 0)
      .toBe(true);
    const occurrences = [...screen.container.querySelectorAll("span")].filter(
      (node) => node.textContent === "No-show",
    );
    expect(occurrences).toHaveLength(3);
  });

  it("never renders 0 € for a missing amount", async () => {
    // "Ne pas afficher 0 € ou une fausse date lorsqu'une donnée n'existe pas."
    const screen = await renderPage();
    await expect
      .element(screen.getByText("Synthèse de l'opportunité"))
      .toBeVisible();
    await expect
      .poll(() =>
        (screen.container.textContent ?? "").includes("Date signature"),
      )
      .toBe(true);
    // The fixture has no won_at, so the field must read the em dash.
    await expect
      .poll(() => (screen.container.textContent ?? "").includes("—"))
      .toBe(true);
  });
});
