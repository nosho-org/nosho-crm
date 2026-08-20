import { transformContainsFilter } from "./transformContainsFilter";
import { transformInFilter } from "./transformInFilter";
import { transformOrFilter } from "./transformOrFilter";

export function transformFilter(filter: Record<string, any>) {
  if (!filter) {
    return undefined;
  }
  const transformedFilters: Record<string, any> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (
      key.endsWith("@eq") ||
      key.endsWith("@neq") ||
      key.endsWith("@lt") ||
      key.endsWith("@lte") ||
      key.endsWith("@gt") ||
      key.endsWith("@gte")
    ) {
      const lastIndexOfAt = key.lastIndexOf("@");
      transformedFilters[
        `${key.substring(0, lastIndexOfAt)}_${key.substring(lastIndexOfAt + 1)}`
      ] = value;
      continue;
    }

    if (key.endsWith("@is")) {
      transformedFilters[`${key.slice(0, -3)}_eq`] = value;
      continue;
    }

    if (key.endsWith("@not.is")) {
      transformedFilters[`${key.slice(0, -7)}_neq`] = value;
      continue;
    }

    // Checked before `@in` because both end in "in".
    // FakeRest's `_neq_any` requires the value to differ from every listed
    // one, and treats a missing field as differing — the same way PostgREST
    // treats `company_type_key` once NULL has been coalesced to ''.
    if (key.endsWith("@not.in")) {
      transformedFilters[`${key.slice(0, -7)}_neq_any`] =
        transformInFilter(value);
      continue;
    }

    if (key.endsWith("@in")) {
      transformedFilters[`${key.slice(0, -3)}_eq_any`] =
        transformInFilter(value);
      continue;
    }

    if (key.endsWith("@cs")) {
      transformedFilters[`${key.slice(0, -3)}`] =
        transformContainsFilter(value);
      continue;
    }

    // Search query
    if (key.endsWith("@or")) {
      transformedFilters["q"] = transformOrFilter(value);
      continue;
    }

    transformedFilters[key] = value;
  }
  return transformedFilters;
}
