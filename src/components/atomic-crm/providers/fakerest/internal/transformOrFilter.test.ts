import { isSearchOrFilter, transformOrFilter } from "./transformOrFilter";

it("should throw an error if the value is not an object", () => {
  expect(() => transformOrFilter([])).toThrow(
    "Invalid '@or' filter, expected an object",
  );
});

it("should throw an error if the object is empty", () => {
  expect(() => transformOrFilter({})).toThrow(
    "Invalid '@or' filter, object is empty",
  );
});

it("should return the query value", () => {
  expect(transformOrFilter({ "last_name@ilike": "one" })).toEqual("one");
  expect(
    transformOrFilter({
      "last_name@ilike": "one",
      "first_name@ilike": "one",
    }),
  ).toEqual("one");
});

describe("isSearchOrFilter", () => {
  it("recognises the search shape: one needle across several columns", () => {
    expect(
      isSearchOrFilter({
        "last_name@ilike": "ada",
        "first_name@ilike": "ada",
      }),
    ).toBe(true);
  });

  it("rejects a real disjunction over distinct columns (#114)", () => {
    // An opportunity's tasks: reachable by deal_id OR through its contacts.
    // Folding this into `q` would search tasks for the free text "36".
    expect(
      isSearchOrFilter({
        "deal_id@eq": 36,
        "contact_id@in": "(7,9)",
      }),
    ).toBe(false);
  });
});
