import {
  EMPTY_FACETS,
  FACET_ALL,
  FACET_UNSET,
  applyDealFacets,
  countActiveFacets,
} from "./dealFilters";
import { makeDeal } from "./testFixtures";

const deals = [
  makeDeal({
    name: "urgent-client",
    priority: "urgent",
    company_type: "client",
  }),
  makeDeal({
    name: "normal-client",
    priority: "normal",
    company_type: "client",
  }),
  makeDeal({
    name: "urgent-prospect",
    priority: "urgent",
    company_type: "prospect",
  }),
  makeDeal({ name: "sans-priorité", company_type: "prospect" }),
  makeDeal({ name: "sans-type", priority: "normal" }),
];

const names = (result: ReturnType<typeof applyDealFacets>) =>
  result.map((deal) => deal.name);

describe("applyDealFacets", () => {
  it("returns the same array reference when no facet is active", () => {
    expect(applyDealFacets(deals, EMPTY_FACETS)).toBe(deals);
  });

  it("filters by priority", () => {
    expect(
      names(applyDealFacets(deals, { ...EMPTY_FACETS, priority: "urgent" })),
    ).toEqual(["urgent-client", "urgent-prospect"]);
  });

  it("filters by type", () => {
    expect(
      names(applyDealFacets(deals, { ...EMPTY_FACETS, type: "client" })),
    ).toEqual(["urgent-client", "normal-client"]);
  });

  it("combines facets", () => {
    expect(
      names(applyDealFacets(deals, { priority: "urgent", type: "prospect" })),
    ).toEqual(["urgent-prospect"]);
  });

  it("can single out deals where the field is not set", () => {
    expect(
      names(applyDealFacets(deals, { ...EMPTY_FACETS, priority: FACET_UNSET })),
    ).toEqual(["sans-priorité"]);
    expect(
      names(applyDealFacets(deals, { ...EMPTY_FACETS, type: FACET_UNSET })),
    ).toEqual(["sans-type"]);
  });

  it("yields nothing for a value no deal carries", () => {
    expect(
      applyDealFacets(deals, { ...EMPTY_FACETS, priority: "important" }),
    ).toEqual([]);
  });
});

describe("countActiveFacets", () => {
  it("counts only the constrained facets", () => {
    expect(countActiveFacets(EMPTY_FACETS)).toBe(0);
    expect(countActiveFacets({ priority: "urgent", type: FACET_ALL })).toBe(1);
    expect(countActiveFacets({ priority: "urgent", type: "client" })).toBe(2);
    expect(countActiveFacets({ priority: FACET_UNSET, type: FACET_ALL })).toBe(
      1,
    );
  });
});
