import type { DataProvider, GetListParams } from "ra-core";
import { matchesDisjunction } from "./disjunctionFilter";
import { transformFilter } from "./transformFilter";
import { isSearchOrFilter } from "./transformOrFilter";

function removeSummarySuffix(resource: string) {
  return resource.endsWith("_summary")
    ? resource.replace("_summary", "")
    : resource;
}

/**
 * Run a list query whose `@or` is a real disjunction over distinct columns —
 * the shape `buildDealTaskFilter` emits to reach an opportunity's tasks (#114).
 *
 * FakeRest cannot express it, so the disjunction is evaluated here: everything
 * else goes to the provider unpaginated, the rows are filtered, then paginated.
 * Fetching the whole collection is acceptable because this only ever runs
 * against the in-memory demo database.
 */
async function listWithDisjunction(
  dataProvider: DataProvider,
  resource: string,
  params: GetListParams,
  disjunction: Record<string, unknown>,
  rest: Record<string, unknown>,
) {
  const { data } = await dataProvider.getList(resource, {
    ...params,
    filter: transformFilter(rest),
    // Paginating before the disjunction is applied would cut rows that should
    // have survived it.
    pagination: { page: 1, perPage: 10_000 },
  });

  const matched = (data as Record<string, unknown>[]).filter((record) =>
    matchesDisjunction(record, disjunction),
  );

  // `pagination` is optional in the ra-core type; every caller in this app
  // sends one, but defaulting beats crashing on the one that forgets.
  const { page = 1, perPage = 25 } = params.pagination ?? {};
  const start = (page - 1) * perPage;

  return { data: matched.slice(start, start + perPage), total: matched.length };
}

export function withSupabaseFilterAdapter<T extends DataProvider>(
  dataProvider: T,
): T {
  return {
    ...dataProvider,
    getOne(resource, params) {
      return dataProvider.getOne(removeSummarySuffix(resource), params);
    },
    getList(resource, params) {
      const table = removeSummarySuffix(resource);
      const { "@or": or, ...rest } = params.filter ?? {};

      // Only a genuine disjunction needs the detour; the search flavour of
      // `@or` maps onto FakeRest's `q` and goes down the normal path.
      if (or && !isSearchOrFilter(or)) {
        return listWithDisjunction(dataProvider, table, params, or, rest);
      }

      return dataProvider.getList(table, {
        ...params,
        filter: transformFilter(params.filter),
      });
    },
    getMany(resource, params) {
      return dataProvider.getMany(removeSummarySuffix(resource), params);
    },
    getManyReference(resource, params) {
      return dataProvider.getManyReference(removeSummarySuffix(resource), {
        ...params,
        filter: transformFilter(params.filter),
      });
    },
    create(resource, params) {
      return dataProvider.create(removeSummarySuffix(resource), params);
    },
    delete(resource, params) {
      return dataProvider.delete(removeSummarySuffix(resource), params);
    },
    deleteMany(resource, params) {
      return dataProvider.deleteMany(removeSummarySuffix(resource), params);
    },
    update(resource, params) {
      return dataProvider.update(removeSummarySuffix(resource), params);
    },
    updateMany(resource, params) {
      return dataProvider.updateMany(removeSummarySuffix(resource), params);
    },
  };
}
