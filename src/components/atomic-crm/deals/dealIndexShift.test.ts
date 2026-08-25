import { QueryClient } from "@tanstack/react-query";

import { applyDealIndexShift } from "./dealUtils";
import type { Deal } from "../types";

/**
 * Guard against the crash of 2026-08-25 (issue #115).
 *
 * Creating an opportunity re-indexes the other deals of the target column, then
 * patches the cached lists so the board does not flicker. That patch was scoped
 * to `["deals", "getList"]`; 822d5fd1 broadened it to `["deals"]` — correct for
 * the three `invalidateQueries` calls it also touched, fatal for this one.
 *
 * `setQueriesData` matches by *prefix*, and ra-core caches three different
 * shapes under that prefix:
 *
 *   ["deals","getList",…] -> { data: Deal[], total }   an array under `data`
 *   ["deals","getOne",…]  -> Deal                      no `data` at all
 *   ["deals","getMany",…] -> Deal[]                    no `data` at all
 *
 * The updater assumed the first and called `res.data.map(...)`, so it threw a
 * TypeError as soon as a deal had been opened in the session. Thrown inside
 * `onSuccess`, it aborted the handler *before* the invalidation and the
 * redirect — the modal stayed open, the board never refreshed, and the
 * opportunity was created all the same. Simon created eleven of them in
 * twenty-nine seconds before reporting the bug.
 */

const deal = (id: number, index: number): Deal =>
  ({ id, index, name: `Deal ${id}`, stage: "qualified" }) as Deal;

/** What the `onSuccess` of DealCreate builds: the shifted deals, keyed by id. */
const SHIFTED = { 1: deal(1, 5), 2: deal(2, 9) } as unknown as Record<
  string,
  Deal
>;

describe("applyDealIndexShift", () => {
  it("replaces the shifted deals in a getList payload", () => {
    const cached = { data: [deal(1, 4), deal(2, 8), deal(3, 0)], total: 3 };

    const next = applyDealIndexShift(cached, SHIFTED);

    expect(next.data.map((d) => d.index)).toEqual([5, 9, 0]);
    expect(next.total).toBe(3);
  });

  it("leaves a getOne payload — a bare record — untouched", () => {
    const cached = deal(1, 4);

    expect(() => applyDealIndexShift(cached, SHIFTED)).not.toThrow();
    expect(applyDealIndexShift(cached, SHIFTED)).toBe(cached);
  });

  it("leaves a getMany payload — a bare array — untouched", () => {
    const cached = [deal(1, 4), deal(2, 8)];

    expect(() => applyDealIndexShift(cached, SHIFTED)).not.toThrow();
    expect(applyDealIndexShift(cached, SHIFTED)).toBe(cached);
  });

  it("leaves an empty cache entry untouched", () => {
    expect(applyDealIndexShift(undefined, SHIFTED)).toBeUndefined();
    expect(applyDealIndexShift(null, SHIFTED)).toBeNull();
  });

  it("does not choke on a list payload whose data is not an array", () => {
    // Defensive: a half-written cache entry must not take the redirect down.
    const cached = { data: null, total: 0 };

    expect(() => applyDealIndexShift(cached, SHIFTED)).not.toThrow();
  });
});

describe('setQueriesData over the ["deals"] prefix', () => {
  it("patches the list without throwing on the getOne and getMany entries", () => {
    const queryClient = new QueryClient();
    // The three shapes ra-core really stores, as a session that has opened a
    // deal page and rendered a <ReferenceField reference="deals"> would hold.
    queryClient.setQueryData(
      ["deals", "getList", { pagination: { page: 1, perPage: 1000 } }],
      { data: [deal(1, 4), deal(2, 8)], total: 2 },
    );
    queryClient.setQueryData(["deals", "getOne", { id: "1" }], deal(1, 4));
    queryClient.setQueryData(
      ["deals", "getMany", { ids: ["1"] }],
      [deal(1, 4)],
    );

    expect(() =>
      queryClient.setQueriesData({ queryKey: ["deals"] }, (res: unknown) =>
        applyDealIndexShift(res, SHIFTED),
      ),
    ).not.toThrow();

    expect(
      queryClient.getQueryData([
        "deals",
        "getList",
        { pagination: { page: 1, perPage: 1000 } },
      ]),
    ).toEqual({ data: [deal(1, 5), deal(2, 9)], total: 2 });
    // getOne and getMany are none of this updater's business.
    expect(queryClient.getQueryData(["deals", "getOne", { id: "1" }])).toEqual(
      deal(1, 4),
    );
    expect(
      queryClient.getQueryData(["deals", "getMany", { ids: ["1"] }]),
    ).toEqual([deal(1, 4)]);
  });
});
