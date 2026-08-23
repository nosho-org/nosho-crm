import {
  HEALTH_FILTERS,
  toDealsLink,
  toListFilter,
} from "./dealFilterContract";

// Pinned so the relative-date filters are assertable.
const TODAY = new Date("2026-08-23T09:00:00.000Z");

describe("toListFilter", () => {
  it("returns nothing for an empty selection", () => {
    // An empty dashboard selection must not narrow the list at all.
    expect(toListFilter({}, { today: TODAY })).toEqual({});
  });

  it("maps the period onto the expected closing date, per the spec", () => {
    // NOS-956: "Période = basée uniquement sur la date de clôture prévue".
    expect(
      toListFilter(
        { periodStart: "2026-08-01", periodEnd: "2026-08-31" },
        { today: TODAY },
      ),
    ).toEqual({
      "expected_closing_date@gte": "2026-08-01",
      "expected_closing_date@lte": "2026-08-31",
    });
  });

  it("maps owner, category, priority and stage to bare equality", () => {
    expect(
      toListFilter(
        { salesId: 4, category: "dentaire", priority: "urgent", stage: "lead" },
        { today: TODAY },
      ),
    ).toEqual({
      sales_id: 4,
      category: "dentaire",
      priority: "urgent",
      stage: "lead",
    });
  });

  it("filters products with overlaps, so multi-select means OR", () => {
    // `cs` (contains) would demand a deal carry *both* products and silently
    // return far fewer rows. The spec asks for either.
    expect(
      toListFilter({ products: ["no-show", "entrant"] }, { today: TODAY }),
    ).toEqual({ "products@ov": "{no-show,entrant}" });
  });

  it("ignores empty and null values rather than filtering on them", () => {
    // A cleared "Responsable: Tous" must widen the list, not match sales_id=''.
    expect(
      toListFilter(
        {
          salesId: "",
          category: null,
          products: [],
          priority: undefined,
          periodStart: null,
        },
        { today: TODAY },
      ),
    ).toEqual({});
  });

  it("resolves the dormancy threshold against last_activity_at", () => {
    // Not `updated_at`: no trigger maintained it before 20260823110000, so on
    // historical rows it still reads as the creation date.
    expect(toListFilter({ staleForDays: 14 }, { today: TODAY })).toEqual({
      "last_activity_at@lt": "2026-08-09",
    });
  });

  it("requires an action to exist for it to be overdue", () => {
    expect(toListFilter({ overdueAction: true }, { today: TODAY })).toEqual({
      "next_action_date@lt": "2026-08-23",
      "next_action@not.is": null,
    });
  });

  it("expresses the two missing-data alerts as IS NULL", () => {
    expect(
      toListFilter({ missingClosingDate: true }, { today: TODAY }),
    ).toEqual({ "expected_closing_date@is": null });

    expect(toListFilter({ missingNextAction: true }, { today: TODAY })).toEqual(
      {
        "next_action@is": null,
      },
    );
  });

  it("combines a dashboard scope with an alert", () => {
    // "Paris / Imagerie / Agent entrant / Thomas" must narrow the alert too —
    // the spec is explicit that pipeline health reacts to the global filters.
    expect(
      toListFilter(
        {
          salesId: 2,
          category: "imagerie",
          products: ["entrant"],
          staleForDays: 14,
        },
        { today: TODAY },
      ),
    ).toEqual({
      sales_id: 2,
      category: "imagerie",
      "products@ov": "{entrant}",
      "last_activity_at@lt": "2026-08-09",
    });
  });
});

describe("toDealsLink", () => {
  it("targets the Opportunités list with a JSON-encoded filter", () => {
    const link = toDealsLink({ stage: "proposal" }, { today: TODAY });
    expect(link.pathname).toBe("/deals");
    expect(link.search.startsWith("filter=")).toBe(true);
  });

  it("round-trips through the URL unchanged", () => {
    // This is the contract: what the dashboard encodes is what the list decodes.
    const state = {
      salesId: 4,
      products: ["no-show", "data"],
      staleForDays: 14,
    };
    const { search } = toDealsLink(state, { today: TODAY });
    const decoded = JSON.parse(
      decodeURIComponent(new URLSearchParams(search).get("filter")!),
    );
    expect(decoded).toEqual(toListFilter(state, { today: TODAY }));
  });

  it("escapes the braces of an array filter", () => {
    // `{` and `}` are legal but ambiguous unencoded; a raw brace would survive
    // most browsers and break the one that normalises it.
    const { search } = toDealsLink(
      { products: ["no-show", "entrant"] },
      { today: TODAY },
    );
    expect(search).not.toContain("{");
    expect(
      JSON.parse(
        decodeURIComponent(new URLSearchParams(search).get("filter")!),
      ),
    ).toEqual({ "products@ov": "{no-show,entrant}" });
  });

  it("accepts an alternative pathname for custom views", () => {
    expect(
      toDealsLink({}, { pathname: "/views/view-1", today: TODAY }).pathname,
    ).toBe("/views/view-1");
  });
});

describe("HEALTH_FILTERS", () => {
  it("covers the four alerts NOS-955 defines", () => {
    expect(Object.keys(HEALTH_FILTERS).sort()).toEqual([
      "dormant",
      "missingClosingDate",
      "missingNextAction",
      "overdueAction",
    ]);
  });

  it("threads the configured inactivity threshold through", () => {
    // `dealInactivityAlertDays` is a setting; the alert count and the list it
    // opens must use the same number.
    expect(toListFilter(HEALTH_FILTERS.dormant(30), { today: TODAY })).toEqual({
      "last_activity_at@lt": "2026-07-24",
    });
  });

  it("produces a usable filter for every alert", () => {
    for (const state of [
      HEALTH_FILTERS.dormant(14),
      HEALTH_FILTERS.overdueAction(),
      HEALTH_FILTERS.missingClosingDate(),
      HEALTH_FILTERS.missingNextAction(),
    ]) {
      expect(
        Object.keys(toListFilter(state, { today: TODAY })).length,
      ).toBeGreaterThan(0);
    }
  });
});
