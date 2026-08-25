import isObject from "lodash/isObject";

function assertOrObject(values: any) {
  if (!isObject(values) || Array.isArray(values)) {
    throw new Error(
      "Invalid '@or' filter, expected an object as first element",
    );
  }
  if (Object.keys(values).length === 0) {
    throw new Error("Invalid '@or' filter, object is empty");
  }
}

/**
 * `@or` carries two different intents, and only one of them maps onto FakeRest.
 *
 *   * full-text search — `{first_name@ilike: "ada", last_name@ilike: "ada"}`:
 *     the same needle across several columns, which is exactly FakeRest's `q`;
 *   * a real disjunction — `{deal_id@eq: 36, contact_id@in: "(7,9)"}`, used to
 *     reach an opportunity's tasks (#114): different columns, different values.
 *     FakeRest has no OR, and there is nothing to fold into `q`.
 *
 * Telling them apart by "are all the operands the same value" is what the
 * search builder guarantees and what a disjunction never satisfies.
 */
export function isSearchOrFilter(values: any): boolean {
  assertOrObject(values);
  const queries = Object.values(values);
  return queries.every((query) => query === queries[0]);
}

export function transformOrFilter(values: any) {
  assertOrObject(values);
  return Object.values(values)[0];
}
