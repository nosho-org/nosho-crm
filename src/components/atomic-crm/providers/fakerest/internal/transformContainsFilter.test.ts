import {
  CONTAINS_FILTER_REGEX,
  transformContainsFilter,
} from "./transformContainsFilter";

it("should throw an error if the filter is not a string", () => {
  expect(() => transformContainsFilter(1)).toThrow(
    `Invalid '@cs' filter value, expected a string matching '${CONTAINS_FILTER_REGEX.source}', got: 1`,
  );
});

it("should throw an error if the filter does not match pattern", () => {
  expect(() => transformContainsFilter("1,2")).toThrow(
    `Invalid '@cs' filter value, expected a string matching '${CONTAINS_FILTER_REGEX.source}', got: 1,2`,
  );
});

it("should support empty arrays", () => {
  expect(transformContainsFilter("{}")).toEqual([]);
});

it("should return an array of numbers", () => {
  expect(transformContainsFilter("{1}")).toEqual([1]);
  expect(transformContainsFilter("{1,2,3}")).toEqual([1, 2, 3]);
});

it("should return an array of strings", () => {
  expect(transformContainsFilter("{a}")).toEqual(["a"]);
  expect(transformContainsFilter("{a,B,c-d}")).toEqual(["a", "B", "c-d"]);
});

it("should return an array of quoted strings", () => {
  expect(transformContainsFilter('{"a"}')).toEqual(["a"]);
  expect(transformContainsFilter('{"a","B, c"}')).toEqual(["a", "B, c"]);
});

describe("the @ov (overlaps) branch of transformFilter", () => {
  it("maps overlaps onto FakeRest's any-of semantics", async () => {
    const { transformFilter } = await import("./transformFilter");
    // "Produit = No-show + Entrant" means either, not both: a deal carrying
    // only No-show must match. `_eq_any` on an array field does exactly that.
    expect(transformFilter({ "products@ov": "{no-show,entrant}" })).toEqual({
      products_eq_any: ["no-show", "entrant"],
    });
  });

  it("treats an empty product set as no constraint", async () => {
    const { transformFilter } = await import("./transformFilter");
    expect(transformFilter({ "products@ov": "{}" })).toEqual({
      products_eq_any: [],
    });
  });
});
