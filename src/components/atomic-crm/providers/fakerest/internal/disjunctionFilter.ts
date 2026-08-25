/**
 * ---------------------------------------------------------------------------
 * `@or` across distinct columns, for the demo provider
 * ---------------------------------------------------------------------------
 * PostgREST answers `or=(deal_id.eq.36,contact_id.in.(7,9))` natively; FakeRest
 * has no OR at all. `transformOrFilter` covers the *other* use of `@or` — the
 * same needle across several columns, which folds into FakeRest's `q`. A real
 * disjunction has nothing to fold into.
 *
 * So the demo evaluates it here instead: the rest of the filter goes to
 * FakeRest, and the disjunction is applied to the rows that come back. Only the
 * operators the app actually emits are supported; anything else throws rather
 * than silently matching everything, because a filter that quietly stops
 * filtering is the exact shape of the bug this whole change is about (#114).
 */

type Leaf = { column: string; operator: string; value: unknown };

const parseLeaf = (key: string, value: unknown): Leaf => {
  const at = key.lastIndexOf("@");
  if (at === -1) return { column: key, operator: "eq", value };
  return { column: key.slice(0, at), operator: key.slice(at + 1), value };
};

/** `(7,9)` — the shape ra-data-postgrest serialises an `in` list into. */
const parseInList = (value: unknown): string[] =>
  String(value)
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const matchesLeaf = (record: Record<string, unknown>, leaf: Leaf): boolean => {
  const actual = record[leaf.column];
  switch (leaf.operator) {
    case "eq":
      // Loose on purpose: FakeRest ids are numbers, filters can carry strings.
      return actual != null && String(actual) === String(leaf.value);
    case "neq":
      return actual == null || String(actual) !== String(leaf.value);
    case "in":
      return actual != null && parseInList(leaf.value).includes(String(actual));
    case "is":
      return leaf.value === null ? actual == null : actual === leaf.value;
    case "not.is":
      return leaf.value === null ? actual != null : actual !== leaf.value;
    case "gt":
      return actual != null && String(actual) > String(leaf.value);
    case "gte":
      return actual != null && String(actual) >= String(leaf.value);
    case "lt":
      return actual != null && String(actual) < String(leaf.value);
    case "lte":
      return actual != null && String(actual) <= String(leaf.value);
    default:
      throw new Error(
        `[fakerest] '@or' operator not supported by the demo provider: ${leaf.operator}`,
      );
  }
};

/** True when the record satisfies at least one branch of the disjunction. */
export const matchesDisjunction = (
  record: Record<string, unknown>,
  disjunction: Record<string, unknown>,
): boolean =>
  Object.entries(disjunction).some(([key, value]) =>
    matchesLeaf(record, parseLeaf(key, value)),
  );
